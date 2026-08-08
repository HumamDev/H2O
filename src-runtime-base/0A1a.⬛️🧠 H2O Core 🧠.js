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
    crossQIdAnswerConflictCount: 0,
    recentCrossQIdAnswerConflicts: [],
    lastCrossQIdAnswerConflict: null,
    lastStructureDecision: null,
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
    // Once the complete-index lane owns presentation, Ledger's canonical
    // projection must consume that same immutable effective index. Native
    // shells are a hydration witness only; a virtualized or mid-transition
    // shell prefix (for example 1..26) is never a second membership authority.
    const effectiveIndex = typeof getEffectivePresentationIndex === 'function'
      ? getEffectivePresentationIndex()
      : null;
    if (
      typeof chatAtlasCompleteIndexAuthorityActive === 'function'
      && chatAtlasCompleteIndexAuthorityActive()
      && effectiveIndex?.complete === true
      && Array.isArray(effectiveIndex.turns)
    ) {
      return effectiveIndex.turns.map((turn, index) => chatAtlasCv2RecordFromDraft({
        qId: turn?.qId || null,
        primaryAId: turn?.primaryAId || null,
        answerIds: Array.isArray(turn?.answerVariants) ? turn.answerVariants.slice() : [],
        aliasIds: [turn?.turnId, ...(turn?.answerVariants || [])],
        noAnswer: turn?.noAnswer === true,
      }, index, `complete-index:${turn?.qId || index + 1}`, { preserveProjectionOrder: true }));
    }
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
      const currentQId = chatAtlasNormalizeId(pair.question?.messageId) || null;
      const questionCurrentAliases = chatAtlasCv2CurrentIds([
        currentQId,
        pair.question?.shellTurnId,
      ]);
      const projectedQId = currentQId
        || previousRecord?.question?.qId
        || chatAtlasNormalizeId(pair.question?.shellTurnId)
        || null;
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
    chatAtlasClearBranchSelectionStaleOnCanonicalReturn(next);
    chatAtlasSelectedPathEvaluate(next);
    if (typeof chatAtlasSelectedPathOverlayEvaluate === 'function') {
      chatAtlasSelectedPathOverlayEvaluate();
    }

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
  const CHAT_ATLAS_CONVERGENCE_UNMATCHED_CLASSIFICATIONS = Object.freeze([
    'cache-only-historical-row',
    'canonical-only-current-row',
    'ledger-only-live-row',
    'branch-inactive-row',
    'unresolved-identity-mismatch',
  ]);

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
    const currentAnswerIds = Array.from(member?.answer?.currentAnswerIds || []).map(chatAtlasNormalizeId).filter(Boolean);
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
        currentAnswerIds,
        currentProjectionSource: String(member?.answer?.currentProjectionSource || ''),
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
        dataId,
        dataQuestionId,
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
        primaryMismatchReason: '',
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

  function chatAtlasConvergenceMatch(entry, owners, fallbackIndex, used = null, targetLength = null) {
    const candidates = new Set();
    for (const id of entry?.allIds || []) {
      for (const index of owners?.get?.(id) || []) candidates.add(index);
    }
    const boundedLength = Number.isInteger(targetLength) && targetLength >= 0 ? targetLength : null;
    const boundedCandidates = Array.from(candidates)
      .filter((index) => Number.isInteger(index) && index >= 0 && (boundedLength == null || index < boundedLength));
    const rejectedCandidateIndexes = Array.from(candidates)
      .filter((index) => !boundedCandidates.includes(index))
      .slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT);
    const available = boundedCandidates.filter((index) => !used?.has(index));
    const claimed = boundedCandidates.filter((index) => used?.has(index));
    if (boundedCandidates.length === 1 && available.length === 1) {
      return {
        index: available[0],
        basis: 'record-local-alias',
        candidates: available,
        claimedCandidates: claimed,
        rejectedCandidateIndexes,
        rejectedFallbackIndex: Number.isInteger(fallbackIndex) ? fallbackIndex : null,
      };
    }
    let basis = 'unmatched';
    if (boundedCandidates.length > 1) basis = 'ambiguous-alias';
    else if (boundedCandidates.length && !available.length) basis = 'already-claimed-alias';
    else if (rejectedCandidateIndexes.length) basis = 'out-of-bounds-alias';
    // Ordinal position is diagnostic context only; it never establishes identity.
    return {
      index: -1,
      basis,
      candidates: available,
      claimedCandidates: claimed,
      rejectedCandidateIndexes,
      rejectedFallbackIndex: Number.isInteger(fallbackIndex) ? fallbackIndex : null,
    };
  }

  function chatAtlasConvergenceUnmatchedTracker() {
    const counts = {};
    for (const classification of CHAT_ATLAS_CONVERGENCE_UNMATCHED_CLASSIFICATIONS) counts[classification] = 0;
    return { counts, evidence: [], total: 0, truncated: false, keys: new Set() };
  }

  function chatAtlasConvergenceRecordUnmatched(tracker, classification, evidence, dedupeKey = '') {
    if (!tracker) return;
    const normalized = CHAT_ATLAS_CONVERGENCE_UNMATCHED_CLASSIFICATIONS.includes(classification)
      ? classification
      : 'unresolved-identity-mismatch';
    const key = String(dedupeKey || `${normalized}:${evidence?.source || 'unknown'}:${evidence?.turnNo || evidence?.domIndex || tracker.total}`);
    if (tracker.keys.has(key)) return;
    tracker.keys.add(key);
    tracker.counts[normalized] += 1;
    tracker.total += 1;
    if (tracker.evidence.length < CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
      tracker.evidence.push({ classification: normalized, ...evidence });
    } else {
      tracker.truncated = true;
    }
  }

  function chatAtlasConvergenceHasPartialCacheEvidence(diagnostics) {
    const currentChatKey = chatAtlasNormalizeChatKey(chatAtlasCurrentChatKey());
    if (!currentChatKey || chatAtlasNormalizeChatKey(diagnostics?.chatKey) !== currentChatKey) return false;
    const cached = chatAtlasNullableCount(diagnostics?.cachedTurnCount);
    const published = chatAtlasNullableCount(diagnostics?.publishedTurnCount);
    const observed = chatAtlasNullableCount(diagnostics?.observedTurnCount);
    const retained = chatAtlasNullableCount(diagnostics?.offDomRetainedCount);
    const merge = diagnostics?.lastMergeDecision;
    const mergeOutputCount = chatAtlasNullableCount(merge?.outputCount);
    const mergeLiveCount = chatAtlasNullableCount(merge?.liveCount);
    return Number(retained || 0) > 0
      || (cached != null && observed != null && cached > observed)
      || (published != null && observed != null && published > observed)
      || (merge?.mode === 'union'
        && mergeOutputCount != null
        && mergeLiveCount != null
        && mergeOutputCount > mergeLiveCount);
  }

  function chatAtlasConvergenceClassifyMiniMapUnmatched(
    box,
    match,
    canonicalOwners,
    canonicalEntries,
    usedCanonical,
    miniMapDiagnostics,
  ) {
    if (match?.basis === 'ambiguous-alias') {
      return { classification: 'unresolved-identity-mismatch', severity: 'blocker', reason: 'ambiguous-ledger-alias-match' };
    }
    if (match?.basis === 'already-claimed-alias') {
      return { classification: 'unresolved-identity-mismatch', severity: 'blocker', reason: 'duplicate-ledger-member-claim' };
    }
    if (match?.basis === 'out-of-bounds-alias') {
      return { classification: 'unresolved-identity-mismatch', severity: 'blocker', reason: 'out-of-bounds-ledger-alias-match' };
    }
    const canonicalMatch = chatAtlasConvergenceMatch(
      box,
      canonicalOwners,
      box?.row?.inferredTurnNo > 0 ? box.row.inferredTurnNo - 1 : box?.row?.domIndex,
      null,
      canonicalEntries.length,
    );
    const canonical = canonicalMatch.index >= 0 && canonicalMatch.index < canonicalEntries.length
      ? canonicalEntries[canonicalMatch.index]
      : null;
    if (canonical?.row && !usedCanonical.has(canonicalMatch.index)) {
      return { classification: 'canonical-only-current-row', severity: 'mismatch', reason: 'canonical-row-has-no-ledger-member' };
    }
    if (!canonical?.row && chatAtlasConvergenceHasPartialCacheEvidence(miniMapDiagnostics)) {
      return { classification: 'cache-only-historical-row', severity: 'warning', reason: 'partial-cache-row-not-in-current-universe' };
    }
    return { classification: 'unresolved-identity-mismatch', severity: 'mismatch', reason: 'no-ledger-member-match' };
  }

  function chatAtlasConvergenceMiniMapPrimaryMismatch(ledger, canonical, box) {
    const actualPrimaryAId = chatAtlasNormalizeId(box?.row?.dataPrimaryAId) || null;
    const currentAnswerIds = Array.from(ledger?.row?.currentAnswerIds || []).map(chatAtlasNormalizeId).filter(Boolean);
    const selectedCurrentAId = currentAnswerIds[currentAnswerIds.length - 1] || null;
    const expectedPrimaryIds = Array.from(chatAtlasConvergenceIds([
      canonical?.row?.primaryAId,
      ledger?.row?.primaryAId,
      selectedCurrentAId,
    ]));
    const noAnswer = canonical?.row?.noAnswer === true || ledger?.row?.noAnswer === true;
    let reason = '';
    if (noAnswer) {
      if (actualPrimaryAId) reason = 'no-answer-minimap-primary-present';
    } else if (!actualPrimaryAId || !expectedPrimaryIds.includes(actualPrimaryAId)) {
      reason = 'minimap-primary-not-member-answer';
    }
    if (!reason) return null;
    return {
      turnNo: ledger?.row?.turnNo || canonical?.row?.turnNo || 0,
      logicalMemberKey: ledger?.row?.logicalMemberKey || null,
      qId: canonical?.row?.qId || ledger?.row?.qId || null,
      canonicalPrimaryAId: canonical?.row?.primaryAId || null,
      ledgerPrimaryAId: ledger?.row?.primaryAId || null,
      currentAnswerIds,
      expectedPrimaryIds,
      actualMiniMapPrimaryAId: actualPrimaryAId,
      miniMapTurnId: box?.row?.dataTurnId || null,
      miniMapQuestionId: box?.row?.dataQuestionId || null,
      reason,
    };
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

  function chatAtlasNormalizeChatKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const routeMatch = raw.match(/\/c\/([a-z0-9-]+)/i);
    return routeMatch ? routeMatch[1] : raw;
  }

  function chatAtlasNullableCount(value) {
    if (value == null || value === '') return null;
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count : null;
  }

  function chatAtlasReadMiniMapCompletenessDiagnostics() {
    const readApi = (target) => {
      if (!target) return null;
      try {
        const candidate = target.H2O_MM_CORE_API
          || target.H2O_MM_SHARED?.get?.()?.api?.core
          || null;
        return typeof candidate?.getCacheCompletenessDiagnostics === 'function'
          ? candidate
          : null;
      } catch {
        return null;
      }
    };
    let topWindow = null;
    try { topWindow = W?.top || null; } catch { topWindow = null; }
    const api = readApi(topWindow) || readApi(W);
    if (!api || typeof api.getCacheCompletenessDiagnostics !== 'function') return null;
    try {
      const result = api.getCacheCompletenessDiagnostics();
      return result && typeof result === 'object' ? result : null;
    } catch {
      return null;
    }
  }

  function chatAtlasValidCompletenessProof(proof, chatKey) {
    if (!proof || typeof proof !== 'object') return false;
    return proof.status === 'complete'
      && proof.kind === 'independent-end-to-end-coverage'
      && proof.independent === true
      && proof.endToEndCoverage === true
      && proof.current === true
      && !!String(proof.basis || '').trim()
      && chatAtlasNormalizeChatKey(proof.chatKey) === chatKey;
  }

  function chatAtlasEvaluateHistoricalCompleteness(miniMapDiagnostics = undefined, completenessProof = null) {
    const currentChatKey = chatAtlasNormalizeChatKey(chatAtlasCurrentChatKey()) || null;
    const diagnostics = miniMapDiagnostics === undefined
      ? chatAtlasReadMiniMapCompletenessDiagnostics()
      : miniMapDiagnostics;
    const diagnosticsChatKey = chatAtlasNormalizeChatKey(diagnostics?.chatKey) || null;
    const sameChat = !!currentChatKey && diagnosticsChatKey === currentChatKey;
    const observedTurnCount = sameChat ? chatAtlasNullableCount(diagnostics?.observedTurnCount) : null;
    const publishedTurnCount = sameChat ? chatAtlasNullableCount(diagnostics?.publishedTurnCount) : null;
    const cachedTurnCount = sameChat ? chatAtlasNullableCount(diagnostics?.cachedTurnCount) : null;
    const offDomRetainedCount = sameChat ? chatAtlasNullableCount(diagnostics?.offDomRetainedCount) : null;
    const merge = sameChat && diagnostics?.lastMergeDecision && typeof diagnostics.lastMergeDecision === 'object'
      ? {
        accepted: diagnostics.lastMergeDecision.accepted === true,
        mode: String(diagnostics.lastMergeDecision.mode || 'unknown'),
        cachedCount: chatAtlasNullableCount(diagnostics.lastMergeDecision.cachedCount),
        liveCount: chatAtlasNullableCount(diagnostics.lastMergeDecision.liveCount),
        outputCount: chatAtlasNullableCount(diagnostics.lastMergeDecision.outputCount),
        overlapCount: chatAtlasNullableCount(diagnostics.lastMergeDecision.overlapCount),
        sanitizedRows: chatAtlasNullableCount(diagnostics.lastMergeDecision.sanitizedRows),
        reason: String(diagnostics.lastMergeDecision.reason || ''),
        completeness: String(diagnostics.lastMergeDecision.completeness || 'unknown'),
      }
      : null;
    const persistence = sameChat && diagnostics?.lastPersistenceDecision
      && typeof diagnostics.lastPersistenceDecision === 'object'
      ? {
        ok: diagnostics.lastPersistenceDecision.ok === true,
        status: String(diagnostics.lastPersistenceDecision.status || 'unknown'),
        previousCount: chatAtlasNullableCount(diagnostics.lastPersistenceDecision.previousCount),
        incomingCount: chatAtlasNullableCount(diagnostics.lastPersistenceDecision.incomingCount),
        proofAccepted: diagnostics.lastPersistenceDecision.proofAccepted === true,
        reason: String(diagnostics.lastPersistenceDecision.reason || ''),
      }
      : null;
    const proofAvailable = !!currentChatKey && chatAtlasValidCompletenessProof(completenessProof, currentChatKey);
    const smallerPersistence = persistence?.previousCount != null
      && persistence?.incomingCount != null
      && persistence.incomingCount < persistence.previousCount;
    const destructiveShrink = !!(smallerPersistence && persistence.ok && !persistence.proofAccepted);
    const protectiveRefusal = !!(smallerPersistence && !persistence.ok
      && persistence.status === 'shrink-not-proven');
    const unionRetained = !!(merge?.mode === 'union'
      && merge.liveCount != null
      && merge.outputCount != null
      && merge.outputCount > merge.liveCount);
    const retainedOffDom = Number(offDomRetainedCount || 0) > 0;
    const cacheLargerThanObserved = cachedTurnCount != null && observedTurnCount != null
      && cachedTurnCount > observedTurnCount;
    const publishedLargerThanObserved = publishedTurnCount != null && observedTurnCount != null
      && publishedTurnCount > observedTurnCount;
    const positivePartialEvidence = retainedOffDom
      || unionRetained
      || cacheLargerThanObserved
      || publishedLargerThanObserved
      || protectiveRefusal
      || destructiveShrink;
    let partialBasis = null;
    if (retainedOffDom) partialBasis = 'off-dom-cache-rows-retained';
    else if (unionRetained) partialBasis = 'partial-hydration-union';
    else if (destructiveShrink) partialBasis = 'unproven-cache-shrink-persisted';
    else if (protectiveRefusal) partialBasis = 'unproven-shrink-refused';
    else if (cacheLargerThanObserved || publishedLargerThanObserved) {
      partialBasis = 'cache-larger-than-observed-projection';
    }

    let status = 'unknown';
    let basis = 'no-independent-completeness-proof';
    if (proofAvailable) {
      status = 'complete';
      basis = String(completenessProof.basis || 'independent-end-to-end-coverage');
    } else if (partialBasis) {
      status = 'incomplete';
      basis = partialBasis;
    }

    const historicalCompleteness = {
      status,
      basis,
      chatKey: currentChatKey,
      observedTurnCount,
      publishedTurnCount,
      cachedTurnCount,
      offDomRetainedCount,
      completenessProofAvailable: proofAvailable,
      latestMergeMode: merge?.mode || null,
      persistenceProtection: persistence ? {
        status: persistence.status,
        previousCount: persistence.previousCount,
        incomingCount: persistence.incomingCount,
        proofAccepted: persistence.proofAccepted,
        reason: persistence.reason,
      } : null,
    };
    const warningEvidence = positivePartialEvidence ? {
      warning: 'incomplete-projection-coverage',
      basis: partialBasis || basis,
      observedTurnCount,
      publishedTurnCount,
      cachedTurnCount,
      offDomRetainedCount,
      latestMergeMode: merge?.mode || null,
    } : null;
    const destructiveShrinkEvidence = destructiveShrink ? {
      blocker: 'unproven-cache-shrink-persisted',
      previousCount: persistence.previousCount,
      incomingCount: persistence.incomingCount,
      status: persistence.status,
      reason: persistence.reason,
    } : null;
    return chatAtlasFreeze({
      historicalCompleteness,
      warningEvidence,
      destructiveShrinkEvidence,
    });
  }

  function chatAtlasInternalExactness(parityStatus, blockers, mismatchCount) {
    const status = String(parityStatus || 'unknown');
    return chatAtlasFreeze({
      status,
      exact: status === 'exact',
      blockerCount: Array.isArray(blockers) ? blockers.length : 0,
      mismatchCount: Math.max(0, Number(mismatchCount || 0) || 0),
    });
  }

  function chatAtlasBuildProjectionConvergenceDiagnostics(
    parityStatus,
    blockers = [],
    mismatchCount = 0,
    miniMapDiagnostics = undefined,
    completenessProof = null,
  ) {
    const completenessEvaluation = chatAtlasEvaluateHistoricalCompleteness(
      miniMapDiagnostics,
      completenessProof,
    );
    const nextBlockers = Array.from(new Set(Array.isArray(blockers) ? blockers : []));
    let nextMismatchCount = Math.max(0, Number(mismatchCount || 0) || 0);
    if (completenessEvaluation.destructiveShrinkEvidence) {
      nextBlockers.push('unproven-cache-shrink-persisted');
      nextMismatchCount += 1;
    }
    const deduplicatedBlockers = Array.from(new Set(nextBlockers));
    const nextParityStatus = completenessEvaluation.destructiveShrinkEvidence
      ? 'mismatch'
      : String(parityStatus || 'unknown');
    return chatAtlasFreeze({
      parityStatus: nextParityStatus,
      blockers: deduplicatedBlockers,
      warning: completenessEvaluation.warningEvidence
        ? 'incomplete-projection-coverage'
        : null,
      internalExactness: chatAtlasInternalExactness(
        nextParityStatus,
        deduplicatedBlockers,
        nextMismatchCount,
      ),
      historicalCompleteness: completenessEvaluation.historicalCompleteness,
      historicalCompletenessWarningEvidence: completenessEvaluation.warningEvidence,
      unprovenCacheShrinkEvidence: completenessEvaluation.destructiveShrinkEvidence,
    });
  }

  function getChatAtlasHistoricalCompleteness() {
    return chatAtlasEvaluateHistoricalCompleteness().historicalCompleteness;
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
      const miniMapPrimaryMismatches = [];
      const blockingAliasMismatches = [];
      const blockingMiniMapUnexpectedBoxes = [];
      const unmatchedRows = chatAtlasConvergenceUnmatchedTracker();
      const miniMapCompletenessDiagnostics = chatAtlasReadMiniMapCompletenessDiagnostics();
      let noAnswerMiniMapPrimaryMismatchCount = 0;
      let miniMapPrimaryNotMemberAnswerCount = 0;
      const washerMismatches = [];
      const washerAudit = [];

      const ledgerEntries = chatAtlasLedgerState.members.map(chatAtlasConvergenceLedgerRow);
      const canonicalEntries = turnState.turns.map((record, index) => chatAtlasConvergenceCanonicalRow(record, index, fieldShapeMismatches));
      const ledgerRows = ledgerEntries.map((entry) => entry.row);
      const canonicalRows = canonicalEntries.map((entry) => entry.row);
      const canonicalOwners = chatAtlasConvergenceAliasOwners(canonicalEntries);
      const usedCanonical = new Set();
      const canonicalByLedgerIndex = new Map();
      const ledgerReady = !!chatAtlasLedgerState.ready;
      const canonicalReady = canonicalRows.length > 0;

      if (ledgerReady) {
      for (let index = 0; index < ledgerEntries.length; index += 1) {
        const ledger = ledgerEntries[index];
        const match = chatAtlasConvergenceMatch(
          ledger,
          canonicalOwners,
          index,
          usedCanonical,
          canonicalEntries.length,
        );
        const canonical = match.index >= 0 && match.index < canonicalEntries.length
          ? canonicalEntries[match.index]
          : null;
        if (!canonical?.row) {
          const classification = match.basis === 'unmatched'
            ? 'ledger-only-live-row'
            : 'unresolved-identity-mismatch';
          const severity = ['ambiguous-alias', 'already-claimed-alias', 'out-of-bounds-alias'].includes(match.basis)
            ? 'blocker'
            : 'mismatch';
          const reason = match.basis === 'ambiguous-alias'
            ? 'ambiguous-canonical-alias-match'
            : match.basis === 'already-claimed-alias'
              ? 'duplicate-canonical-member-claim'
              : match.basis === 'out-of-bounds-alias'
                ? 'out-of-bounds-canonical-alias-match'
                : 'canonical-record-not-matched';
          const mismatch = {
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            classification,
            severity,
            reason,
            candidateIndexes: Array.from(new Set([
              ...(match.candidates || []),
              ...(match.claimedCandidates || []),
              ...(match.rejectedCandidateIndexes || []),
            ])).slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT),
          };
          aliasMismatches.push(mismatch);
          if (severity === 'blocker') blockingAliasMismatches.push(mismatch);
          chatAtlasConvergenceRecordUnmatched(
            unmatchedRows,
            classification,
            { source: 'ledger', severity, reason, logicalMemberKey: ledger.row.logicalMemberKey, turnNo: ledger.row.turnNo },
            `ledger:${index}`,
          );
          continue;
        }
        usedCanonical.add(match.index);
        canonicalByLedgerIndex.set(index, canonical);
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

      }
      if (ledgerReady && canonicalReady) {

      for (let index = 0; index < canonicalEntries.length; index += 1) {
        if (!usedCanonical.has(index)) {
          const mismatch = {
            source: 'canonical',
            canonicalIndex: index,
            turnNo: canonicalEntries[index].row.turnNo,
            classification: 'canonical-only-current-row',
            severity: 'mismatch',
            reason: 'canonical-record-not-matched-to-ledger',
          };
          aliasMismatches.push(mismatch);
          chatAtlasConvergenceRecordUnmatched(
            unmatchedRows,
            'canonical-only-current-row',
            { source: 'canonical', severity: 'mismatch', reason: mismatch.reason, turnNo: mismatch.turnNo },
            `canonical:${index}`,
          );
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
      const usedLedger = new Set();
      if (ledgerReady) {
      for (let index = 0; index < miniMapEntries.length; index += 1) {
        const box = miniMapEntries[index];
        const fallbackIndex = box.row.inferredTurnNo > 0 ? box.row.inferredTurnNo - 1 : index;
        const match = chatAtlasConvergenceMatch(
          box,
          ledgerOwners,
          fallbackIndex,
          usedLedger,
          ledgerEntries.length,
        );
        const ledger = match.index >= 0 && match.index < ledgerEntries.length
          ? ledgerEntries[match.index]
          : null;
        if (!ledger?.row) {
          const unmatched = chatAtlasConvergenceClassifyMiniMapUnmatched(
            box,
            match,
            canonicalOwners,
            canonicalEntries,
            usedCanonical,
            miniMapCompletenessDiagnostics,
          );
          box.row.mismatchReason = unmatched.reason;
          const evidence = {
            ...box.row,
            classification: unmatched.classification,
            severity: unmatched.severity,
            candidateIndexes: Array.from(new Set([
              ...(match.candidates || []),
              ...(match.claimedCandidates || []),
              ...(match.rejectedCandidateIndexes || []),
            ])).slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT),
          };
          miniMapUnexpectedBoxes.push(evidence);
          if (unmatched.severity === 'blocker') blockingMiniMapUnexpectedBoxes.push(evidence);
          chatAtlasConvergenceRecordUnmatched(
            unmatchedRows,
            unmatched.classification,
            {
              source: 'minimap',
              severity: unmatched.severity,
              reason: unmatched.reason,
              domIndex: box.row.domIndex,
              turnNo: box.row.inferredTurnNo,
            },
            `minimap:${index}`,
          );
          continue;
        }
        usedLedger.add(match.index);
        box.row.resolvedTurnNo = ledger.row.turnNo;
        box.row.resolvedLogicalMemberKey = ledger.row.logicalMemberKey;
        const primaryMismatch = chatAtlasConvergenceMiniMapPrimaryMismatch(
          ledger,
          canonicalByLedgerIndex.get(match.index) || null,
          box,
        );
        if (primaryMismatch) {
          box.row.primaryMismatchReason = primaryMismatch.reason;
          if (primaryMismatch.reason === 'no-answer-minimap-primary-present') {
            noAnswerMiniMapPrimaryMismatchCount += 1;
          } else if (primaryMismatch.reason === 'minimap-primary-not-member-answer') {
            miniMapPrimaryNotMemberAnswerCount += 1;
          }
          if (miniMapPrimaryMismatches.length < CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
            miniMapPrimaryMismatches.push(primaryMismatch);
          }
        }
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
      if (unmatchedRows.evidence.some((entry) => entry.severity !== 'blocker')) {
        warnings.push('convergence-unmatched-rows');
      }

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
        miniMapPrimaryMismatches,
        washerMismatches,
      ];
      if (countMismatches.length) blockers.push('count-mismatch');
      if (orderMismatches.length) blockers.push('ledger-canonical-order-mismatch');
      if (fieldShapeMismatches.length) blockers.push('canonical-field-shape-mismatch');
      if (qIdMismatches.length) blockers.push('question-id-mismatch');
      if (primaryAIdMismatches.length) blockers.push('primary-answer-id-mismatch');
      if (blockingAliasMismatches.length) blockers.push('record-local-alias-mismatch');
      if (noAnswerMismatches.length) blockers.push('no-answer-mismatch');
      if (pageNoMismatches.length) blockers.push('page-membership-mismatch');
      if (miniMapMissingBoxes.length) blockers.push('minimap-missing-boxes');
      if (blockingMiniMapUnexpectedBoxes.length) blockers.push('minimap-unexpected-boxes');
      if (miniMapOrderMismatches.length) blockers.push('minimap-order-mismatch');
      if (noAnswerMiniMapPrimaryMismatchCount) blockers.push('no-answer-minimap-primary-present');
      if (miniMapPrimaryNotMemberAnswerCount) blockers.push('minimap-primary-not-member-answer');
      if (washerMismatches.length) blockers.push('washer-mismatch');

      const unknown = !ledgerReady || !canonicalReady || !miniMapRendered;
      const mismatch = mismatchGroups.some((group) => group.length > 0);
      const parityStatus = unknown ? 'unknown' : (mismatch ? 'mismatch' : (warnings.length ? 'warn' : 'exact'));
      const safetyAfter = chatAtlasConvergenceSafetyCounters();
      const safety = chatAtlasConvergenceSafetyResult(safetyBefore, safetyAfter);
      if (!safety.safetyCountersUnchanged) blockers.push('safety-counter-changed-during-probe');
      const mismatchCount = mismatchGroups.reduce((total, group) => total + group.length, 0)
        + (safety.safetyCountersUnchanged ? 0 : 1);
      const projectionDiagnostics = chatAtlasBuildProjectionConvergenceDiagnostics(
        safety.safetyCountersUnchanged ? parityStatus : 'mismatch',
        blockers,
        mismatchCount,
        miniMapCompletenessDiagnostics,
      );
      if (projectionDiagnostics.warning) warnings.push(projectionDiagnostics.warning);

      return chatAtlasFreeze({
        readOnly: true,
        authority: 'chat-atlas-convergence-parity',
        parityStatus: projectionDiagnostics.parityStatus,
        blockers: projectionDiagnostics.blockers,
        warnings: Array.from(new Set(warnings)),
        notes,
        chatKey: chatAtlasLedgerState.chatKey,
        internalExactness: projectionDiagnostics.internalExactness,
        historicalCompleteness: projectionDiagnostics.historicalCompleteness,
        historicalCompletenessWarningEvidence: projectionDiagnostics.historicalCompletenessWarningEvidence,
        unprovenCacheShrinkEvidence: projectionDiagnostics.unprovenCacheShrinkEvidence,
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
        noAnswerMiniMapPrimaryMismatchCount,
        miniMapPrimaryNotMemberAnswerCount,
        miniMapPrimaryMismatchSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
        miniMapPrimaryMismatches,
        unmatchedRowCounts: { ...unmatchedRows.counts },
        unmatchedRowTotal: unmatchedRows.total,
        unmatchedRowEvidenceSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
        unmatchedRowEvidenceTruncated: unmatchedRows.truncated,
        unmatchedRowEvidence: unmatchedRows.evidence,
        washerAudit,
        washerMismatches,
        miniMapRootSelector: miniMapRoot ? CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL : null,
        miniMapBoxSelector: miniMapRoot ? CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL : null,
        ...safety,
      });
    } catch (error) {
      const safetyAfter = chatAtlasConvergenceSafetyCounters();
      const safety = chatAtlasConvergenceSafetyResult(safetyBefore, safetyAfter);
      const projectionDiagnostics = chatAtlasBuildProjectionConvergenceDiagnostics('unknown', [], 0);
      const unmatchedRows = chatAtlasConvergenceUnmatchedTracker();
      const catchWarnings = [
        `convergence-parity-probe-failed:${String(error?.message || error || 'unknown')}`,
      ];
      if (projectionDiagnostics.warning) catchWarnings.push(projectionDiagnostics.warning);
      return chatAtlasFreeze({
        readOnly: true,
        authority: 'chat-atlas-convergence-parity',
        parityStatus: projectionDiagnostics.parityStatus,
        blockers: projectionDiagnostics.blockers,
        warnings: Array.from(new Set(catchWarnings)),
        notes: ['operator-called-read-only-probe'],
        chatKey: chatAtlasLedgerState.chatKey,
        internalExactness: projectionDiagnostics.internalExactness,
        historicalCompleteness: projectionDiagnostics.historicalCompleteness,
        historicalCompletenessWarningEvidence: projectionDiagnostics.historicalCompletenessWarningEvidence,
        unprovenCacheShrinkEvidence: projectionDiagnostics.unprovenCacheShrinkEvidence,
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
        noAnswerMiniMapPrimaryMismatchCount: 'unknown',
        miniMapPrimaryNotMemberAnswerCount: 'unknown',
        miniMapPrimaryMismatchSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
        miniMapPrimaryMismatches: [],
        unmatchedRowCounts: { ...unmatchedRows.counts },
        unmatchedRowTotal: 0,
        unmatchedRowEvidenceSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
        unmatchedRowEvidenceTruncated: false,
        unmatchedRowEvidence: [],
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
    const turnNo = turnState.byQId.get(key);
    return turnNo > 0 ? getRecordByTurnNoInternal(turnNo) : null;
  }

  function getRecordByAIdInternal(aId) {
    const key = normalizeTurnAlias(aId);
    if (!key) return null;
    const turnNo = turnState.byAId.get(key);
    return turnNo > 0 ? getRecordByTurnNoInternal(turnNo) : null;
  }

  function buildCanonicalTurnId(turn) {
    const turnNo = Math.max(1, Number(turn?.turnNo || turn?.idx || 1) || 1);
    const qId = normalizeTurnAlias(turn?.qId || '');
    const primaryAId = normalizeTurnAlias(turn?.primaryAId || '');
    if (qId) return `turn:${qId}`;
    if (primaryAId) return `turn:a:${primaryAId}`;
    return `turn:${turnNo}`;
  }

  const turnFlowIdentityByRef = new WeakMap();
  let turnFlowIdentitySequence = 0;

  function turnFlowIdentity(flowRef) {
    if (!flowRef || (typeof flowRef !== 'object' && typeof flowRef !== 'function')) return '';
    if (!turnFlowIdentityByRef.has(flowRef)) {
      turnFlowIdentitySequence += 1;
      turnFlowIdentityByRef.set(flowRef, `flow:${turnFlowIdentitySequence}`);
    }
    return turnFlowIdentityByRef.get(flowRef) || '';
  }

  function parseConversationTurnOrdinal(section) {
    const testId = String(section?.getAttribute?.(ATTR_TESTID) || '');
    const match = testId.match(/conversation-turn-(\d+)/);
    if (!match) return null;
    const ordinal = Number(match[1]);
    return Number.isInteger(ordinal) && ordinal >= 0 ? ordinal : null;
  }

  function isSelectedConversationSection(section) {
    if (!section?.isConnected) return false;
    let node = section;
    while (node) {
      if (
        node.hidden === true
        || node.inert === true
        || String(node.getAttribute?.('aria-hidden') || '').toLowerCase() === 'true'
        || node.hasAttribute?.('hidden')
        || node.hasAttribute?.('inert')
      ) return false;
      if (node !== section && node.matches?.('main, #thread, [data-ho-chat-root="true"]')) break;
      node = node.parentElement || null;
    }
    return true;
  }

  function readTurnEntryStructure(node, explicitSection = null, sourceIndex = 0) {
    let section = explicitSection;
    if (!section && node) {
      try { section = node.closest?.(SEL_CORE_TURN_SECTION) || null; } catch { section = null; }
    }
    const ordinal = parseConversationTurnOrdinal(section);
    let flowRef = null;
    try {
      flowRef = section?.closest?.('main#main, #thread, [data-ho-chat-root="true"], [class*="group/scroll-root"], main')
        || section?.ownerDocument?.body
        || null;
    } catch { flowRef = section?.ownerDocument?.body || null; }
    return {
      known: !!section && ordinal != null,
      ordinal,
      sectionRef: section || null,
      sectionIdentity: String(
        section?.getAttribute?.(ATTR_TESTID)
        || section?.getAttribute?.('data-turn-id')
        || '',
      ).trim() || null,
      flowRef,
      flowIdentity: turnFlowIdentity(flowRef),
      selectedPathEligible: section ? isSelectedConversationSection(section) : null,
      sourceIndex: Math.max(0, Number(sourceIndex || 0) || 0),
    };
  }

  function turnEntryBoundary(previous, current) {
    const left = previous?.structure || null;
    const right = current?.structure || null;
    if (!left && !right) return null;
    if (left?.known !== true && right?.known !== true) return null;
    if (!left?.known || !right?.known) return 'structure-unproven';
    if (!left.flowRef || !right.flowRef || left.flowRef !== right.flowRef) return 'flow-changed';
    if (left.selectedPathEligible !== right.selectedPathEligible) return 'selected-path-changed';
    if (right.selectedPathEligible !== true) return 'selected-path-ineligible';
    if (Number(right.ordinal) !== Number(left.ordinal) + 1) return 'ordinal-discontinuity';
    return null;
  }

  function boundedTurnDraftStructure(structure = null) {
    if (!structure || typeof structure !== 'object') return null;
    return {
      segmentId: Math.max(0, Number(structure.segmentId || 0) || 0),
      flowIdentity: String(structure.flowIdentity || turnFlowIdentity(structure.flowRef) || '').trim(),
      structureKnown: structure.structureKnown === true,
      selectedPathEligible: structure.selectedPathEligible === true,
      pairingContiguous: structure.pairingContiguous === true,
      currentQuestionProof: structure.currentQuestionProof === true,
      unpairedAssistant: structure.unpairedAssistant === true,
      questionOrdinal: structure.questionOrdinal != null && Number.isFinite(Number(structure.questionOrdinal))
        ? Math.max(0, Number(structure.questionOrdinal))
        : null,
      answerOrdinals: (Array.isArray(structure.answerOrdinals) ? structure.answerOrdinals : [])
        .filter((value) => value != null && Number.isFinite(Number(value)))
        .map((value) => Math.max(0, Number(value)))
        .slice(0, 64),
    };
  }

  function attachTurnDraftStructureEvidence(drafts, evidence = null) {
    if (!Array.isArray(drafts)) return drafts;
    const bounded = evidence && typeof evidence === 'object'
      ? Object.freeze({
        structureKnown: evidence.structureKnown === true,
        safeForDurableReplacement: evidence.safeForDurableReplacement === true,
        entryCount: Math.max(0, Number(evidence.entryCount || 0) || 0),
        segmentCount: Math.max(0, Number(evidence.segmentCount || 0) || 0),
        boundaryCount: Math.max(0, Number(evidence.boundaryCount || 0) || 0),
        gapCount: Math.max(0, Number(evidence.gapCount || 0) || 0),
        unpairedAssistantCount: Math.max(0, Number(evidence.unpairedAssistantCount || 0) || 0),
        ineligibleCount: Math.max(0, Number(evidence.ineligibleCount || 0) || 0),
        shellVariantSupplementCount: Math.max(0, Number(evidence.shellVariantSupplementCount || 0) || 0),
        firstOrdinal: evidence.firstOrdinal != null && Number.isFinite(Number(evidence.firstOrdinal))
          ? Number(evidence.firstOrdinal)
          : null,
        lastOrdinal: evidence.lastOrdinal != null && Number.isFinite(Number(evidence.lastOrdinal))
          ? Number(evidence.lastOrdinal)
          : null,
        reasons: (Array.isArray(evidence.reasons) ? evidence.reasons : [])
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .slice(0, 12),
      })
      : null;
    try {
      Object.defineProperty(drafts, '_structureEvidence', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: bounded,
      });
    } catch {}
    return drafts;
  }

  function getTurnDraftStructureEvidence(drafts) {
    return Array.isArray(drafts) && drafts._structureEvidence
      ? { ...drafts._structureEvidence, reasons: [...(drafts._structureEvidence.reasons || [])] }
      : null;
  }

  function isStreamingAnswerPlaceholderId(value) {
    return normalizeTurnAlias(value).startsWith('request-placeholder-');
  }

  function mergeCanonicalAnswerState(existingIds, incomingIds, preferredPrimary = '', existingPrimary = '', opts = {}) {
    if (opts?.explicitRemoval === true) return { answerIds: [], primaryAId: null };
    let answerIds = [];
    const seen = new Set();
    for (const value of [...(existingIds || []), ...(incomingIds || [])]) {
      const answerId = normalizeTurnAlias(value);
      if (!answerId || seen.has(answerId)) continue;
      seen.add(answerId);
      answerIds.push(answerId);
    }
    if (answerIds.some((answerId) => !isStreamingAnswerPlaceholderId(answerId))) {
      answerIds = answerIds.filter((answerId) => !isStreamingAnswerPlaceholderId(answerId));
    }
    const incomingPrimary = normalizeTurnAlias(preferredPrimary || '');
    const retainedPrimary = normalizeTurnAlias(existingPrimary || '');
    const primaryAId = opts?.suppressPrimary === true
      ? null
      : (answerIds.includes(incomingPrimary)
        ? incomingPrimary
        : (answerIds.includes(retainedPrimary) ? retainedPrimary : (answerIds[answerIds.length - 1] || null)));
    if (primaryAId) {
      const index = answerIds.indexOf(primaryAId);
      if (index >= 0 && index !== answerIds.length - 1) {
        answerIds.splice(index, 1);
        answerIds.push(primaryAId);
      }
    }
    return { answerIds, primaryAId };
  }

  function buildTurnDraftsFromEntries(entries = []) {
    const drafts = [];
    let current = null;
    let idx = 0;
    let previousEntry = null;
    let segmentId = 0;
    let boundaryCount = 0;
    let gapCount = 0;
    let unpairedAssistantCount = 0;
    let ineligibleCount = 0;
    const reasons = [];
    const structuredEntries = (Array.isArray(entries) ? entries : []).map((entry, sourceIndex) => {
      const structure = entry?.structure || readTurnEntryStructure(
        entry?.qEl || entry?.aEl || null,
        entry?.sectionRef || null,
        sourceIndex,
      );
      return {
        ...entry,
        structure: {
          ...structure,
          flowIdentity: String(structure?.flowIdentity || turnFlowIdentity(structure?.flowRef) || '').trim(),
        },
      };
    });

    const finalize = (draft) => {
      if (!draft) return null;
      draft.qId = normalizeTurnAlias(draft.qId || '') || null;
      draft.answerIds = Array.from(new Set(draft.answerIds.map((id) => normalizeTurnAlias(id)).filter(Boolean)));
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
      draft.structure = boundedTurnDraftStructure(draft.structure);
      return draft;
    };

    for (const entry of structuredEntries) {
      const boundaryReason = previousEntry ? turnEntryBoundary(previousEntry, entry) : null;
      if (!previousEntry || boundaryReason) {
        segmentId += 1;
        current = null;
        if (boundaryReason) {
          boundaryCount += 1;
          if (boundaryReason === 'ordinal-discontinuity') gapCount += 1;
          if (!reasons.includes(boundaryReason)) reasons.push(boundaryReason);
        }
      }
      if (entry?.structure?.selectedPathEligible === false) ineligibleCount += 1;
      const role = String(entry?.role || '').trim();
      if (role === 'user') {
        idx += 1;
        current = {
          turnNo: idx,
          qId: entry?.qId || null,
          answerIds: [],
          aliasIds: Array.isArray(entry?.aliasIds) ? entry.aliasIds.slice() : [],
          structure: {
            segmentId,
            flowIdentity: entry?.structure?.flowIdentity || '',
            structureKnown: entry?.structure?.known === true,
            selectedPathEligible: entry?.structure?.selectedPathEligible === true,
            pairingContiguous: entry?.structure?.known === true
              && entry?.structure?.selectedPathEligible === true,
            currentQuestionProof: entry?.structure?.known === true
              && entry?.structure?.selectedPathEligible === true,
            unpairedAssistant: false,
            questionOrdinal: entry?.structure?.ordinal ?? null,
            answerOrdinals: [],
          },
          live: {
            qEl: entry?.qEl?.isConnected ? entry.qEl : null,
            primaryAEl: null,
            answerEls: [],
            connected: !!(entry?.qEl && entry.qEl.isConnected),
          },
        };
        drafts.push(current);
        previousEntry = entry;
        continue;
      }

      if (role !== 'assistant') {
        previousEntry = entry;
        continue;
      }
      if (!current) {
        idx += 1;
        unpairedAssistantCount += 1;
        current = {
          turnNo: idx,
          qId: null,
          answerIds: [],
          aliasIds: [],
          structure: {
            segmentId,
            flowIdentity: entry?.structure?.flowIdentity || '',
            structureKnown: entry?.structure?.known === true,
            selectedPathEligible: entry?.structure?.selectedPathEligible === true,
            pairingContiguous: false,
            currentQuestionProof: false,
            unpairedAssistant: true,
            questionOrdinal: null,
            answerOrdinals: [],
          },
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
      if (entry?.structure?.ordinal != null) current.structure.answerOrdinals.push(entry.structure.ordinal);
      if (entry?.structure?.known !== true || entry?.structure?.selectedPathEligible !== true) {
        current.structure.pairingContiguous = false;
        current.structure.currentQuestionProof = false;
      }
      previousEntry = entry;
    }

    const out = drafts.map(finalize).filter(Boolean);
    const ordinals = structuredEntries
      .map((entry) => entry?.structure?.ordinal)
      .filter((value) => value != null && Number.isFinite(Number(value)))
      .map(Number);
    const structureKnown = structuredEntries.length > 0
      && structuredEntries.every((entry) => entry?.structure?.known === true);
    const safeForDurableReplacement = structureKnown
      && segmentId === 1
      && boundaryCount === 0
      && unpairedAssistantCount === 0
      && ineligibleCount === 0
      && (ordinals[0] === 0 || ordinals[0] === 1);
    return attachTurnDraftStructureEvidence(out, {
      structureKnown,
      safeForDurableReplacement,
      entryCount: structuredEntries.length,
      segmentCount: structuredEntries.length ? segmentId : 0,
      boundaryCount,
      gapCount,
      unpairedAssistantCount,
      ineligibleCount,
      shellVariantSupplementCount: 0,
      firstOrdinal: ordinals[0] ?? null,
      lastOrdinal: ordinals[ordinals.length - 1] ?? null,
      reasons,
    });
  }

  function readBootSplitPairEvidence() {
    try {
      const read = chatAtlasReadEvidence();
      return chatAtlasPairEvidence(read?.evidence || []);
    } catch {
      return { pairs: [], rejectedAssistants: [] };
    }
  }

  function mergeBootSplitDrafts(questionDraft, answerDraft, pair) {
    const qId = normalizeTurnAlias(pair?.question?.messageId || '');
    const answerIds = Array.from(new Set([
      ...(questionDraft?.answerIds || []),
      ...(answerDraft?.answerIds || []),
    ].map((value) => normalizeTurnAlias(value)).filter(Boolean)));
    const answerEls = Array.from(new Set([
      ...(questionDraft?.live?.answerEls || []),
      ...(answerDraft?.live?.answerEls || []),
      ...(pair?.answers || []).map((answer) => answer?.roleNode).filter((node) => node?.isConnected),
    ].filter(Boolean)));
    const qEl = questionDraft?.live?.qEl?.isConnected
      ? questionDraft.live.qEl
      : (pair?.question?.roleNode?.isConnected ? pair.question.roleNode : null);
    const aliasIds = Array.from(new Set([
      ...(questionDraft?.aliasIds || []),
      ...(answerDraft?.aliasIds || []),
      questionDraft?.qId,
      answerDraft?.qId,
      pair?.question?.messageId,
      pair?.question?.shellTurnId,
      ...(pair?.answers || []).flatMap((answer) => [
        answer?.messageId,
        answer?.shellTurnId,
      ]),
      ...answerIds,
    ].map((value) => normalizeTurnAlias(value)).filter(Boolean)));
    const preferredPrimaryAId = normalizeTurnAlias(
      answerDraft?.primaryAId || questionDraft?.primaryAId || '',
    );
    const primaryAId = answerIds.includes(preferredPrimaryAId)
      ? preferredPrimaryAId
      : (answerIds[answerIds.length - 1] || null);
    const pairedPrimaryAEl = (pair?.answers || []).find((answer) => (
      normalizeTurnAlias(answer?.messageId || '') === primaryAId
      || normalizeTurnAlias(answer?.shellTurnId || '') === primaryAId
    ))?.roleNode;
    const primaryAEl = (pairedPrimaryAEl?.isConnected ? pairedPrimaryAEl : null)
      || answerDraft?.live?.primaryAEl
      || questionDraft?.live?.primaryAEl
      || answerEls[answerEls.length - 1]
      || null;
    const rawQuestionOrdinal = pair?.question?.shellOrdinal;
    const questionOrdinal = rawQuestionOrdinal != null && Number.isFinite(Number(rawQuestionOrdinal))
      ? Math.max(0, Number(rawQuestionOrdinal))
      : null;
    const answerOrdinals = (pair?.answers || [])
      .map((answer) => answer?.shellOrdinal)
      .filter((value) => value != null && Number.isFinite(Number(value)))
      .map((value) => Math.max(0, Number(value)));
    const structuralPairingProven = questionOrdinal != null
      && answerOrdinals.length > 0
      && answerOrdinals.every((ordinal, index) => ordinal === questionOrdinal + index + 1)
      && (pair?.answers || []).every((answer) => answer?.flowRef === pair?.question?.flowRef);
    return {
      ...questionDraft,
      qId: qId || normalizeTurnAlias(questionDraft?.qId || '') || null,
      answerIds,
      primaryAId,
      aliasIds,
      hasQuestion: !!(qId || questionDraft?.qId),
      hasAssistant: answerIds.length > 0,
      structure: {
        segmentId: Math.max(
          1,
          Number(questionDraft?.structure?.segmentId || answerDraft?.structure?.segmentId || 1) || 1,
        ),
        flowIdentity: String(
          questionDraft?.structure?.flowIdentity
          || answerDraft?.structure?.flowIdentity
          || turnFlowIdentity(pair?.question?.flowRef)
          || '',
        ).trim(),
        structureKnown: structuralPairingProven,
        selectedPathEligible: structuralPairingProven,
        pairingContiguous: structuralPairingProven,
        currentQuestionProof: structuralPairingProven,
        unpairedAssistant: false,
        questionOrdinal,
        answerOrdinals,
      },
      live: {
        qEl,
        primaryAEl,
        answerEls,
        connected: !!(
          qEl?.isConnected
          || primaryAEl?.isConnected
          || answerEls.some((el) => !!el?.isConnected)
        ),
      },
    };
  }

  function reconcileBootSplitTurnDrafts(drafts = [], pairing = null) {
    const source = (Array.isArray(drafts) ? drafts : []).map((draft) => ({
      ...draft,
      answerIds: Array.isArray(draft?.answerIds) ? draft.answerIds.slice() : [],
      aliasIds: Array.isArray(draft?.aliasIds) ? draft.aliasIds.slice() : [],
      live: {
        qEl: draft?.live?.qEl || null,
        primaryAEl: draft?.live?.primaryAEl || null,
        answerEls: Array.isArray(draft?.live?.answerEls) ? draft.live.answerEls.slice() : [],
        connected: !!draft?.live?.connected,
      },
    }));
    const pairs = Array.isArray(pairing?.pairs) ? pairing.pairs : [];
    const proposals = [];
    let ambiguousCount = 0;

    for (const pair of pairs) {
      const currentQId = normalizeTurnAlias(pair?.question?.messageId || '');
      if (!currentQId || !pair?.question?.hydrated) continue;
      const pairAnswerIds = new Set((pair?.answers || []).flatMap((answer) => [
        answer?.messageId,
        answer?.shellTurnId,
      ]).map((value) => normalizeTurnAlias(value)).filter(Boolean));
      if (!pairAnswerIds.size) continue;

      const questionCandidates = [];
      const answerCandidates = [];
      for (let index = 0; index < source.length; index += 1) {
        const draft = source[index];
        const draftQId = normalizeTurnAlias(draft?.qId || '');
        const draftAnswerIds = (draft?.answerIds || [])
          .map((value) => normalizeTurnAlias(value))
          .filter(Boolean);
        const questionOnly = !!draftQId && draftAnswerIds.length === 0;
        const answerOnly = !draftQId && draftAnswerIds.length > 0;
        const sameQuestionNode = !!draft?.live?.qEl
          && !!pair?.question?.roleNode
          && draft.live.qEl === pair.question.roleNode;
        if (questionOnly && (draftQId === currentQId || sameQuestionNode)) {
          questionCandidates.push(index);
        }
        if (answerOnly && draftAnswerIds.some((answerId) => pairAnswerIds.has(answerId))) {
          answerCandidates.push(index);
        }
      }

      if (questionCandidates.length !== 1 || answerCandidates.length !== 1) {
        if (questionCandidates.length || answerCandidates.length) ambiguousCount += 1;
        continue;
      }
      if (questionCandidates[0] === answerCandidates[0]) continue;
      proposals.push({
        pair,
        questionIndex: questionCandidates[0],
        answerIndex: answerCandidates[0],
      });
    }

    const questionUses = new Map();
    const answerUses = new Map();
    for (const proposal of proposals) {
      questionUses.set(proposal.questionIndex, (questionUses.get(proposal.questionIndex) || 0) + 1);
      answerUses.set(proposal.answerIndex, (answerUses.get(proposal.answerIndex) || 0) + 1);
    }

    const mergedAt = new Map();
    const removed = new Set();
    let reconciledCount = 0;
    for (const proposal of proposals) {
      if (questionUses.get(proposal.questionIndex) !== 1 || answerUses.get(proposal.answerIndex) !== 1) {
        ambiguousCount += 1;
        continue;
      }
      if (removed.has(proposal.questionIndex) || removed.has(proposal.answerIndex)) {
        ambiguousCount += 1;
        continue;
      }
      const targetIndex = Math.min(proposal.questionIndex, proposal.answerIndex);
      const removedIndex = Math.max(proposal.questionIndex, proposal.answerIndex);
      mergedAt.set(targetIndex, mergeBootSplitDrafts(
        source[proposal.questionIndex],
        source[proposal.answerIndex],
        proposal.pair,
      ));
      removed.add(removedIndex);
      reconciledCount += 1;
    }

    const out = [];
    for (let index = 0; index < source.length; index += 1) {
      if (removed.has(index)) continue;
      const draft = mergedAt.get(index) || source[index];
      draft.turnNo = out.length + 1;
      out.push(draft);
    }
    attachTurnDraftStructureEvidence(out, getTurnDraftStructureEvidence(drafts));
    return { drafts: out, reconciledCount, ambiguousCount };
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
    for (let index = 0; index < nodes.length; index += 1) {
      const el = nodes[index];
      const role = el.getAttribute(ATTR_MESSAGE_AUTHOR_ROLE);
      const structure = readTurnEntryStructure(el, null, index);
      if (role === 'user') {
        entries.push({
          role,
          qEl: el,
          qId: getQId(el),
          aliasIds: [
            getMsgIdAttr(el),
            String(el?.dataset?.turnId || '').trim(),
          ],
          structure,
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
          structure,
        });
      }
    }
    return buildTurnDraftsFromEntries(entries);
  }

  function buildPaginationTurnDrafts(rows = []) {
    const entries = [];
    const sourceRows = Array.isArray(rows) ? rows : [];
    for (let index = 0; index < sourceRows.length; index += 1) {
      const row = sourceRows[index];
      const role = String(row?.role || '').trim();
      const node = row?.node || null;
      const answerEl = row?.answerEl || row?.primaryAEl || null;
      const structure = readTurnEntryStructure(node || answerEl, null, index);
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
          structure,
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
          structure,
        });
      }
    }
    return buildTurnDraftsFromEntries(entries);
  }

  function canonicalDraftHasStructuralQuestionProof(draft) {
    const structure = draft?.structure || null;
    return structure?.structureKnown === true
      && structure?.selectedPathEligible === true
      && structure?.pairingContiguous === true
      && structure?.currentQuestionProof === true
      && structure?.questionOrdinal != null
      && Number(structure.questionOrdinal) >= 0;
  }

  function canonicalQIdsConflict(record, draft) {
    const recordQId = normalizeTurnAlias(record?.qId || '');
    const draftQId = normalizeTurnAlias(draft?.qId || '');
    return !!recordQId && !!draftQId && recordQId !== draftQId;
  }

  function canonicalRecordMatchesMountedQuestionShell(record, draft) {
    const mounted = canonicalMountedQuestionIdentity(draft);
    if (!mounted.qId || !mounted.shellTurnId) return false;
    const identities = canonicalRecordIdentityValues(record);
    return identities.has(mounted.shellTurnId) || identities.has(`turn:${mounted.shellTurnId}`);
  }

  function recordCanonicalCrossQIdConflict(record, draft, basis = 'unproven-cross-qid-match') {
    const existingQId = normalizeTurnAlias(record?.qId || '') || null;
    const incomingQId = normalizeTurnAlias(draft?.qId || '') || null;
    if (!existingQId || !incomingQId || existingQId === incomingQId) return null;
    const existingAnswers = canonicalRecordAnswerIds(record);
    const incomingAnswers = canonicalDraftAnswerIds(draft);
    const sharedAnswerIds = Array.from(incomingAnswers).filter((answerId) => existingAnswers.has(answerId)).slice(0, 12);
    const conflict = Object.freeze({
      existingQId,
      incomingQId,
      basis: String(basis || 'unproven-cross-qid-match'),
      sharedAnswerIds,
    });
    turnState.crossQIdAnswerConflictCount += 1;
    turnState.lastCrossQIdAnswerConflict = conflict;
    turnState.recentCrossQIdAnswerConflicts.push(conflict);
    if (turnState.recentCrossQIdAnswerConflicts.length > 12) {
      turnState.recentCrossQIdAnswerConflicts.splice(0, turnState.recentCrossQIdAnswerConflicts.length - 12);
    }
    return conflict;
  }

  function findPreviousTurnRecordMatch(draft, used = new Set()) {
    const candidates = [];
    const seen = new Set();
    const pushRecord = (record, basis) => {
      if (!record || used.has(record) || seen.has(record)) return;
      seen.add(record);
      candidates.push({ record, basis });
    };

    pushRecord(getRecordByTurnIdInternal(buildCanonicalTurnId(draft)), 'canonical-turn-id');
    if (draft?.qId) pushRecord(getRecordByQIdInternal(draft.qId), 'current-question-id');
    if (draft?.primaryAId) pushRecord(getRecordByAIdInternal(draft.primaryAId), 'current-answer-identity');
    for (const answerId of draft?.answerIds || []) {
      pushRecord(getRecordByAIdInternal(answerId), 'current-answer-identity');
    }
    for (const aliasId of draft?.aliasIds || []) {
      pushRecord(getRecordByTurnIdInternal(aliasId), 'historical-alias-only');
    }
    if (!candidates.length && !(turnState.paginationDrafts && turnState.paginationDrafts.length)) {
      pushRecord(getRecordByTurnNoInternal(draft?.turnNo || 0), 'ordinal-fallback');
    }

    for (const candidate of candidates) {
      if (
        normalizeTurnAlias(candidate.record?.qId || '')
        && !normalizeTurnAlias(draft?.qId || '')
      ) continue;
      if (!canonicalQIdsConflict(candidate.record, draft)) return candidate;
      if (canonicalRecordMatchesMountedQuestionShell(candidate.record, draft)) {
        return { record: candidate.record, basis: 'mounted-question-shell' };
      }
      recordCanonicalCrossQIdConflict(candidate.record, draft, candidate.basis);
    }
    return { record: null, basis: 'unmatched' };
  }

  function findPreviousTurnRecord(draft, used = new Set()) {
    return findPreviousTurnRecordMatch(draft, used).record;
  }

  function canonicalMountedQuestionIdentity(draft) {
    const qEl = draft?.live?.qEl || null;
    if (!qEl?.isConnected) return { qId: null, shellTurnId: null };
    const qId = normalizeTurnAlias(
      qEl.getAttribute?.(ATTR_MESSAGE_ID)
      || qEl.dataset?.messageId
      || '',
    ) || null;
    let shellTurnId = null;
    try {
      const shell = qEl.closest?.(CHAT_ATLAS_SHELL_SEL) || null;
      shellTurnId = normalizeTurnAlias(shell?.getAttribute?.('data-turn-id') || '') || null;
    } catch {}
    return { qId, shellTurnId };
  }

  function canonicalRecordIdentityValues(record) {
    return new Set([
      normalizeTurnAlias(record?.qId || ''),
      normalizeTurnAlias(record?.turnId || ''),
      ...(record?._aliasIds || []).map((value) => normalizeTurnAlias(value)),
    ].filter(Boolean));
  }

  function canonicalDraftAnswerIds(draft) {
    return new Set([
      normalizeTurnAlias(draft?.primaryAId || ''),
      ...(draft?.answerIds || []).map((value) => normalizeTurnAlias(value)),
    ].filter(Boolean));
  }

  function canonicalRecordAnswerIds(record) {
    return new Set([
      normalizeTurnAlias(record?.primaryAId || ''),
      ...(record?.answerIds || []).map((value) => normalizeTurnAlias(value)),
    ].filter(Boolean));
  }

  function canonicalLiveDraftMatch(records, draft, used = new Set()) {
    const available = (Array.isArray(records) ? records : []).filter((record) => record && !used.has(record));
    const draftQId = normalizeTurnAlias(draft?.qId || '');
    const mounted = canonicalMountedQuestionIdentity(draft);
    const draftAnswers = canonicalDraftAnswerIds(draft);
    const draftAliases = new Set((draft?.aliasIds || []).map((value) => normalizeTurnAlias(value)).filter(Boolean));
    const unique = (candidates, basis) => candidates.length === 1
      ? { record: candidates[0], basis, candidateCount: 1 }
      : null;

    if (draftQId) {
      const exact = unique(available.filter((record) => normalizeTurnAlias(record.qId) === draftQId), 'current-question-id');
      if (exact) return exact;
    }

    if (mounted.shellTurnId) {
      const shellTurnId = mounted.shellTurnId;
      const shellTurnVariant = `turn:${shellTurnId}`;
      const shell = unique(available.filter((record) => {
        const identities = canonicalRecordIdentityValues(record);
        return identities.has(shellTurnId) || identities.has(shellTurnVariant);
      }), 'mounted-question-shell');
      if (shell) return shell;
    }

    if (draftAnswers.size) {
      const answers = unique(available.filter((record) => {
        if (canonicalQIdsConflict(record, draft)) return false;
        const recordAnswers = canonicalRecordAnswerIds(record);
        return Array.from(draftAnswers).some((value) => recordAnswers.has(value));
      }), 'current-answer-identity');
      if (answers) return answers;
    }

    if (draftAliases.size) {
      const aliases = unique(available.filter((record) => {
        if (canonicalQIdsConflict(record, draft)) return false;
        const identities = canonicalRecordIdentityValues(record);
        return Array.from(draftAliases).some((value) => identities.has(value));
      }), 'historical-alias-only');
      if (aliases) return aliases;
    }
    return { record: null, basis: 'unmatched', candidateCount: 0 };
  }

  function syncDurableCurrentQuestionIdentity(previousQId, currentQId, draft) {
    const previous = normalizeTurnAlias(previousQId || '');
    const current = normalizeTurnAlias(currentQId || '');
    if (!previous || !current || previous === current) return false;
    ensureDurableTurnCache();
    const order = turnState.durableOrder;
    const byKey = turnState.durableByKey;
    const previousKey = `q:${previous}`;
    let sourceKey = byKey.has(previousKey) ? previousKey : '';
    if (!sourceKey) return false;

    const retained = byKey.get(sourceKey);
    if (!retained) return false;
    const next = slimTurnDraft({
      ...retained,
      qId: current,
      answerIds: Array.from(new Set([...(retained.answerIds || []), ...(draft?.answerIds || [])])),
      aliasIds: Array.from(new Set([...(retained.aliasIds || []), ...(draft?.aliasIds || []), previous])),
    });
    const currentKey = `q:${current}`;
    const sourceIndex = order.indexOf(sourceKey);
    const existingCurrent = currentKey !== sourceKey ? byKey.get(currentKey) : null;
    const existingIndex = existingCurrent ? order.indexOf(currentKey) : -1;
    if (existingCurrent) {
      next.answerIds = Array.from(new Set([...(existingCurrent.answerIds || []), ...next.answerIds]));
      next.aliasIds = Array.from(new Set([...(existingCurrent.aliasIds || []), ...next.aliasIds, previous]));
    }
    byKey.delete(sourceKey);
    byKey.set(currentKey, next);
    const occupiedIndexes = [sourceIndex, existingIndex].filter((index) => index >= 0);
    const replacementIndex = occupiedIndexes.length ? Math.min(...occupiedIndexes) : order.length;
    for (const index of occupiedIndexes.sort((a, b) => b - a)) {
      order.splice(index, 1);
    }
    order.splice(replacementIndex, 0, currentKey);
    return true;
  }

  function promoteCanonicalCurrentQuestionIdentity(record, draft, match = {}) {
    const mounted = canonicalMountedQuestionIdentity(draft);
    const currentQId = mounted.qId;
    const previousQId = normalizeTurnAlias(record?.qId || '');
    if (!record || !currentQId) return { changed: false, reason: 'mounted-question-id-unavailable' };
    if (currentQId === previousQId) return { changed: false, reason: 'already-current' };
    const positiveBasis = match?.basis === 'mounted-question-shell';
    if (!positiveBasis) return { changed: false, reason: 'selected-path-proof-missing' };

    record._aliasIds = Array.from(new Set([
      ...(record._aliasIds || []),
      previousQId,
    ].map((value) => normalizeTurnAlias(value)).filter(Boolean)));
    record.qId = currentQId;
    record.hasQuestion = true;
    record.turnId = buildCanonicalTurnId(record);
    syncDurableCurrentQuestionIdentity(previousQId, currentQId, draft);
    return {
      changed: true,
      reason: match.basis,
      previousQId: previousQId || null,
      currentQId,
    };
  }

  function applyCanonicalDraft(record, draft, opts = {}) {
    const turnNo = Math.max(1, Number(draft?.turnNo || record?.turnNo || 1) || 1);
    const incomingAnswerIds = Array.isArray(draft?.answerIds) ? draft.answerIds.slice() : [];
    const explicitPrimaryAId = normalizeTurnAlias(draft?.primaryAId || '');
    const previousQId = normalizeTurnAlias(record?.qId || '');
    const currentQId = normalizeTurnAlias(draft?.qId || '');
    if (previousQId && !currentQId) return refreshLegacyTurnCompat(record);
    if (
      previousQId
      && currentQId
      && previousQId !== currentQId
      && opts?.allowQIdTransition !== true
    ) {
      recordCanonicalCrossQIdConflict(record, draft, opts?.basis || 'apply-canonical-draft');
      return refreshLegacyTurnCompat(record);
    }
    const sameQuestion = !!previousQId && previousQId === currentQId;
    const answerState = mergeCanonicalAnswerState(
      sameQuestion && opts?.completeIndexAuthority !== true ? record?.answerIds : [],
      incomingAnswerIds,
      explicitPrimaryAId,
      sameQuestion && opts?.completeIndexAuthority !== true ? record?.primaryAId : '',
      {
        explicitRemoval: draft?.noAnswer === true && incomingAnswerIds.length === 0,
        suppressPrimary: draft?.noAnswer === true && incomingAnswerIds.length > 0,
      },
    );
    record.turnNo = turnNo;
    record.qId = currentQId || null;
    record.answerIds = answerState.answerIds;
    record.primaryAId = answerState.primaryAId;
    record.turnId = buildCanonicalTurnId({
      turnNo,
      qId: record.qId,
      primaryAId: record.primaryAId,
    });
    record.hasQuestion = !!record.qId;
    record.hasAssistant = !!record.answerIds.length;
    record.noAnswer = draft?.noAnswer === true;
    if (draft?.completeIndexAuthority === true) {
      record.stopped = draft?.stopped === true;
      record.completeIndexAuthority = true;
      record.completenessProvenance = String(draft?.completenessProvenance || '');
      record.completeIndexPayloadUpdateTime = draft?.payloadUpdateTime ?? null;
      record.completeIndexFingerprint = String(draft?.sourceFingerprint || '');
      record.completeIndexPending = false;
      delete record.livePendingProvenance;
      delete record.livePendingStreaming;
    } else if (draft?.completeIndexPending === true) {
      record.completeIndexAuthority = false;
      record.completeIndexPending = true;
      record.livePendingProvenance = 'live-pending-overlay';
      record.livePendingStreaming = (Array.isArray(draft?.answerIds) ? draft.answerIds : [])
        .some((answerId) => isStreamingAnswerPlaceholderId(answerId));
      delete record.completenessProvenance;
      delete record.completeIndexPayloadUpdateTime;
      delete record.completeIndexFingerprint;
    } else {
      delete record.stopped;
      delete record.completeIndexAuthority;
      delete record.completeIndexPending;
      delete record.livePendingProvenance;
      delete record.livePendingStreaming;
      delete record.completenessProvenance;
      delete record.completeIndexPayloadUpdateTime;
      delete record.completeIndexFingerprint;
    }
    record._aliasIds = Array.from(new Set([
      ...(record?._aliasIds || []),
      ...(draft?.aliasIds || []),
      previousQId && previousQId !== currentQId ? previousQId : '',
    ].map((value) => normalizeTurnAlias(value)).filter(Boolean)));
    if (draft?.completeIndexAuthority === true) {
      record._aliasIds = record._aliasIds.filter((aliasId) => !isStreamingAnswerPlaceholderId(aliasId));
    }
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

  function applyLiveDraft(record, draft, match = {}) {
    if (!record || !draft) return record;
    let shouldRebuildTurnId = false;
    record.live = {
      qEl: draft?.live?.qEl || null,
      primaryAEl: draft?.live?.primaryAEl || null,
      answerEls: Array.isArray(draft?.live?.answerEls) ? draft.live.answerEls.filter(Boolean) : [],
      connected: !!draft?.live?.connected,
    };
    // Once a globally-proven index owns historical identity, mounted evidence
    // may bind elements/geometry but may not remove variants, flip NO ANSWER,
    // rekey the question, or replace the selected historical primary.
    if (record.completeIndexAuthority === true) return refreshLegacyTurnCompat(record);
    const questionPromotion = promoteCanonicalCurrentQuestionIdentity(record, draft, match);
    if (questionPromotion.changed) {
      shouldRebuildTurnId = true;
    } else if (
      !record.qId
      && canonicalMountedQuestionIdentity(draft).qId
      && canonicalDraftHasStructuralQuestionProof(draft)
    ) {
      record.qId = canonicalMountedQuestionIdentity(draft).qId;
      record.hasQuestion = true;
      shouldRebuildTurnId = true;
    }
    if (draft?.noAnswer === true) {
      record.answerIds = [];
      record.primaryAId = null;
      record.hasAssistant = false;
      record.noAnswer = true;
      shouldRebuildTurnId = true;
    } else if (Array.isArray(draft?.answerIds) && draft.answerIds.length) {
      const answerState = mergeCanonicalAnswerState(
        record?.answerIds,
        draft.answerIds,
        draft?.primaryAId,
        record?.primaryAId,
      );
      record.answerIds = answerState.answerIds;
      record.primaryAId = answerState.primaryAId;
      record.hasAssistant = !!record.answerIds.length;
      record.noAnswer = false;
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

  // True while a trusted native branch selection is mid-transition: the
  // committed turn list still describes the outgoing branch, so unmatched
  // mounted turns must not extend it (they belong to the incoming branch and
  // will be represented by the validated branch index instead).
  function chatAtlasBranchTransitionSuppressesLiveAppend() {
    try {
      if (completeTurnIndexAuthorityState.enabled !== true) return false;
      // The suppression owner is the whole transition, not one boolean: a
      // live click intent, an in-flight token-matched acquisition, or stale
      // scope that has not yet resolved into a current selected-path overlay.
      // Once the overlay IS the effective presentation the branch is
      // complete, and genuinely new turns may append again.
      // The branch transaction is the dominant owner: while it is pending or
      // fail-closed, no mounted foreign turn may extend authority — regardless
      // of what happens to the stale flag, intent, or host payload underneath.
      // Route/reset/supersession explicitly replace or reset the keyed owner.
      const transaction = typeof chatAtlasBranchTransactionCurrent === 'function'
        ? chatAtlasBranchTransactionCurrent()
        : null;
      if (transaction?.state === 'pending' || transaction?.state === 'fail-closed') return true;
      const overlaySettled = typeof chatAtlasSelectedPathOverlayCurrent === 'function'
        && chatAtlasSelectedPathOverlayCurrent();
      if (overlaySettled) return false;
      if (completeTurnIndexAuthorityState.branchSelectionStale === true) return true;
      if (completeTurnIndexAuthorityState.trustedSelectedPathIntent) return true;
      if (
        selectedPathAcquisitionState.token
        && selectedPathAcquisitionState.refetchActiveForToken === selectedPathAcquisitionState.token
      ) return true;
      return false;
    } catch {
      return false;
    }
  }

  function commitTurnDrafts(canonicalDrafts, liveDrafts = canonicalDrafts) {
    const nextRecords = [];
    const used = new Set();

    const sourceDrafts = Array.isArray(canonicalDrafts) ? canonicalDrafts : [];
    for (let i = 0; i < sourceDrafts.length; i += 1) {
      const draft = sourceDrafts[i] || {};
      draft.turnNo = i + 1;
      const previousMatch = findPreviousTurnRecordMatch(draft, used);
      const existing = previousMatch.record;
      const record = existing || createTurnRecord('', draft.turnNo);
      applyCanonicalDraft(record, draft, {
        basis: previousMatch.basis,
        allowQIdTransition: previousMatch.basis === 'mounted-question-shell',
        completeIndexAuthority: draft?.completeIndexAuthority === true,
      });
      used.add(record);
      nextRecords.push(record);
    }

    rebuildTurnMaps(nextRecords);

    const unmatchedLiveDrafts = [];
    const usedLiveRecords = new Set();
    for (const draft of Array.isArray(liveDrafts) ? liveDrafts : []) {
      const match = canonicalLiveDraftMatch(nextRecords, draft, usedLiveRecords);
      const record = match.record;

      if (!record) {
        unmatchedLiveDrafts.push(draft);
        continue;
      }
      usedLiveRecords.add(record);
      applyLiveDraft(record, draft, match);
    }

    for (const draft of unmatchedLiveDrafts) {
      // A trusted branch transition replaces mounted content while the
      // committed list still describes the outgoing branch. A mounted turn
      // that cannot be matched against current authority in that window
      // belongs to the incoming branch; appending it publishes a hybrid count
      // (outgoing branch + one foreign turn) that no complete branch ever
      // had. Suppress the append until branch authority settles — the turn
      // re-enters through the validated branch index or a later clean commit.
      if (chatAtlasBranchTransitionSuppressesLiveAppend()) {
        completeTurnIndexAuthorityState.branchTransitionSuppressedLiveAppendCount += 1;
        continue;
      }
      const record = createTurnRecord('', nextRecords.length + 1);
      draft.turnNo = nextRecords.length + 1;
      applyCanonicalDraft(record, draft);
      applyLiveDraft(record, draft, { record, basis: 'new-live-turn', candidateCount: 1 });
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
      primaryAId: draft?.primaryAId || null,
      answerIds: Array.isArray(draft?.answerIds) ? draft.answerIds.slice() : [],
      aliasIds: Array.isArray(draft?.aliasIds) ? draft.aliasIds.slice() : [],
      hasQuestion: !!draft?.qId,
      hasAssistant: !!(Array.isArray(draft?.answerIds) && draft.answerIds.length),
      noAnswer: draft?.noAnswer === true,
      stopped: draft?.stopped === true,
      structure: boundedTurnDraftStructure(draft?.structure),
      live: { qEl: null, primaryAEl: null, answerEls: [], connected: false },
    };
  }

  function mergeSameQuestionDraftEvidence(existing, incoming) {
    const existingQId = normalizeTurnAlias(existing?.qId || '');
    const incomingQId = normalizeTurnAlias(incoming?.qId || '');
    if (!existingQId || existingQId !== incomingQId) return slimTurnDraft(incoming);
    const answerState = mergeCanonicalAnswerState(
      existing?.answerIds,
      incoming?.answerIds,
      incoming?.primaryAId,
      existing?.primaryAId,
      { explicitRemoval: incoming?.noAnswer === true },
    );
    return slimTurnDraft({
      ...existing,
      ...incoming,
      qId: incomingQId,
      answerIds: answerState.answerIds,
      primaryAId: answerState.primaryAId,
      aliasIds: Array.from(new Set([
        ...(existing?.aliasIds || []),
        ...(incoming?.aliasIds || []),
      ].map((value) => normalizeTurnAlias(value)).filter(Boolean))),
      hasQuestion: true,
      hasAssistant: answerState.answerIds.length > 0,
      noAnswer: incoming?.noAnswer === true,
    });
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
      if (draft?.structure?.unpairedAssistant === true) continue;
      const key = durableDraftKey(draft);
      if (!key) continue;
      if (turnState.durableByKey.has(key)) {
        if (key.startsWith('q:')) {
          turnState.durableByKey.set(key, mergeSameQuestionDraftEvidence(turnState.durableByKey.get(key), draft));
        }
        continue;
      }
      turnState.durableByKey.set(key, slimTurnDraft(draft));
      turnState.durableOrder.push(key);
    }
  }

  function mergeDurableTurnDrafts(liveDrafts, opts = {}) {
    ensureDurableTurnCache();
    const live = Array.isArray(liveDrafts) ? liveDrafts : [];
    if (opts?.authoritativeReplacement === true) {
      seedDurableTurnDrafts(live);
      return live.slice();
    }
    if (!turnState.durableOrder.length) {
      seedDurableTurnDrafts(live);
      return live.slice();
    }
    const order = turnState.durableOrder;
    const byKey = turnState.durableByKey;
    const freshByKey = new Map();
    const ephemeral = [];

    // Each contiguous host segment carries its own anchor. An unpaired answer
    // remains visible for the current frame but never enters durable retention.
    let anchorIdx = -1;
    let previousSegmentId = null;
    for (const draft of live) {
      const segmentId = Number(draft?.structure?.segmentId || 0) || null;
      if (previousSegmentId != null && segmentId != null && segmentId !== previousSegmentId) {
        anchorIdx = order.length - 1;
      }
      previousSegmentId = segmentId;
      if (draft?.structure?.unpairedAssistant === true) {
        ephemeral.push(draft);
        continue;
      }
      const key = durableDraftKey(draft);
      if (!key) continue;
      const retainedDraft = byKey.get(key);
      const freshDraft = freshByKey.get(key);
      const mergedDraft = key.startsWith('q:') && (retainedDraft || freshDraft)
        ? mergeSameQuestionDraftEvidence(freshDraft || retainedDraft, draft)
        : slimTurnDraft(draft);
      freshByKey.set(key, mergedDraft);
      byKey.set(key, mergedDraft);
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
    for (const draft of ephemeral) out.push(draft);
    return out;
  }

  function sectionDraftAuthorityDecision(sectionDrafts, liveDrafts) {
    ensureDurableTurnCache();
    const evidence = getTurnDraftStructureEvidence(sectionDrafts);
    const reasons = [];
    if (!Array.isArray(sectionDrafts) || !sectionDrafts.length) reasons.push('section-drafts-unavailable');
    if (!evidence?.structureKnown) reasons.push('section-structure-unproven');
    if (!evidence?.safeForDurableReplacement) reasons.push('section-coverage-not-proven');
    if (Number(evidence?.gapCount || 0) > 0) reasons.push('section-ordinal-gap');
    if (Number(evidence?.segmentCount || 0) !== 1) reasons.push('section-segments-not-bijective');
    if (Number(evidence?.unpairedAssistantCount || 0) > 0) reasons.push('section-unpaired-assistant');
    if (Number(evidence?.ineligibleCount || 0) > 0) reasons.push('section-selected-path-ineligible');
    if (Array.isArray(sectionDrafts) && sectionDrafts.length < turnState.durableOrder.length) {
      reasons.push('section-membership-smaller-than-retained');
    }
    const accepted = reasons.length === 0;
    return Object.freeze({
      accepted,
      basis: accepted ? 'contiguous-selected-path-coverage' : 'section-authority-unproven',
      sectionDraftCount: Array.isArray(sectionDrafts) ? sectionDrafts.length : 0,
      liveDraftCount: Array.isArray(liveDrafts) ? liveDrafts.length : 0,
      retainedDraftCount: turnState.durableOrder.length,
      structure: evidence,
      reasons: reasons.slice(0, 12),
    });
  }

  function getCanonicalTurnStructureDiagnostics() {
    const decision = turnState.lastStructureDecision;
    return Object.freeze({
      crossQIdAnswerConflictCount: Math.max(0, Number(turnState.crossQIdAnswerConflictCount || 0) || 0),
      lastCrossQIdAnswerConflict: turnState.lastCrossQIdAnswerConflict
        ? { ...turnState.lastCrossQIdAnswerConflict, sharedAnswerIds: [...turnState.lastCrossQIdAnswerConflict.sharedAnswerIds] }
        : null,
      recentCrossQIdAnswerConflicts: turnState.recentCrossQIdAnswerConflicts.map((row) => ({
        ...row,
        sharedAnswerIds: [...row.sharedAnswerIds],
      })),
      lastStructureDecision: decision
        ? {
          ...decision,
          reasons: [...(decision.reasons || [])],
          structure: decision.structure
            ? { ...decision.structure, reasons: [...(decision.structure.reasons || [])] }
            : null,
        }
        : null,
    });
  }

  // ChatGPT exposes conversation-turn sections, but virtualization can leave
  // multiple disconnected ordinal segments mounted at once. Section metadata
  // is authoritative only when the scan proves one complete contiguous path;
  // otherwise the hydrated rows are merged into durable state without shrink.
  const SEL_CORE_TURN_SECTION = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';

  function buildSectionTurnDrafts() {
    let sections = [];
    try { sections = Array.from(D.querySelectorAll(SEL_CORE_TURN_SECTION)); } catch { sections = []; }
    if (!sections.length) return null;

    const entries = [];
    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index];
      const role = String(section.getAttribute?.('data-turn') || '').trim().toLowerCase();
      if (role !== 'user' && role !== 'assistant') continue;
      const turnAttrId = String(section.getAttribute?.('data-turn-id') || '').trim();
      let msgEl = null;
      try { msgEl = section.querySelector(`[${ATTR_MESSAGE_AUTHOR_ROLE}="${role}"]`) || null; } catch {}
      const structure = readTurnEntryStructure(msgEl, section, index);
      if (role === 'user') {
        entries.push({
          role,
          qEl: msgEl,
          qId: (msgEl ? getQId(msgEl) : '') || turnAttrId,
          aliasIds: [turnAttrId, msgEl ? getMsgIdAttr(msgEl) : ''],
          structure,
        });
      } else {
        entries.push({
          role,
          aEl: msgEl,
          aId: (msgEl ? getAId(msgEl) : '') || turnAttrId,
          aliasIds: [turnAttrId, msgEl ? getMsgIdAttr(msgEl) : ''],
          structure,
        });
      }
    }
    if (!entries.length) return null;
    return buildTurnDraftsFromEntries(entries);
  }

  function supplementSegmentShellVariants(liveDrafts = [], sectionDrafts = []) {
    const live = (Array.isArray(liveDrafts) ? liveDrafts : []).map((draft) => ({
      ...draft,
      answerIds: Array.isArray(draft?.answerIds) ? draft.answerIds.slice() : [],
      aliasIds: Array.isArray(draft?.aliasIds) ? draft.aliasIds.slice() : [],
      structure: draft?.structure ? { ...draft.structure } : null,
      live: draft?.live ? {
        ...draft.live,
        answerEls: Array.isArray(draft.live.answerEls) ? draft.live.answerEls.slice() : [],
      } : { qEl: null, primaryAEl: null, answerEls: [], connected: false },
    }));
    const shells = Array.isArray(sectionDrafts) ? sectionDrafts : [];
    let supplementedRows = 0;

    for (let liveIndex = 0; liveIndex < live.length; liveIndex += 1) {
      const current = live[liveIndex];
      const selectedPrimary = normalizeTurnAlias(current?.primaryAId || '');
      const liveStructure = current?.structure || null;
      if (!selectedPrimary || !liveStructure?.structureKnown || liveStructure?.selectedPathEligible !== true) continue;
      const matches = shells.filter((shellDraft) => {
        const shellStructure = shellDraft?.structure || null;
        const shellAnswerIds = (shellDraft?.answerIds || []).map((value) => normalizeTurnAlias(value)).filter(Boolean);
        const shellOrdinals = Array.isArray(shellStructure?.answerOrdinals)
          ? shellStructure.answerOrdinals.map(Number)
          : [];
        if (shellAnswerIds.length < 2 || shellAnswerIds.length !== shellOrdinals.length) return false;
        if (!shellAnswerIds.includes(selectedPrimary)) return false;
        if (!shellStructure?.structureKnown || shellStructure?.selectedPathEligible !== true) return false;
        if (!liveStructure.flowIdentity || liveStructure.flowIdentity !== shellStructure.flowIdentity) return false;
        if (!liveStructure.segmentId || liveStructure.segmentId !== shellStructure.segmentId) return false;
        if (shellOrdinals.some((ordinal, index) => index > 0 && ordinal !== shellOrdinals[index - 1] + 1)) return false;
        const selectedOrdinal = shellOrdinals[shellAnswerIds.indexOf(selectedPrimary)];
        if (!liveStructure.answerOrdinals?.map(Number).includes(selectedOrdinal)) return false;
        const liveQId = normalizeTurnAlias(current?.qId || '');
        const shellQId = normalizeTurnAlias(shellDraft?.qId || '');
        return !liveQId || !shellQId || liveQId === shellQId;
      });
      if (matches.length !== 1) continue;

      const shellDraft = matches[0];
      const merged = mergeCanonicalAnswerState(
        shellDraft.answerIds,
        current.answerIds,
        selectedPrimary,
        shellDraft.primaryAId,
      );
      if (merged.answerIds.length <= current.answerIds.length) continue;
      live[liveIndex] = {
        ...current,
        answerIds: merged.answerIds,
        primaryAId: selectedPrimary,
        aliasIds: Array.from(new Set([
          ...(current.aliasIds || []),
          ...(shellDraft.aliasIds || []),
          ...merged.answerIds,
        ].map((value) => normalizeTurnAlias(value)).filter(Boolean))),
        structure: {
          ...liveStructure,
          answerOrdinals: shellDraft.structure.answerOrdinals.slice(),
          shellVariantSupplemented: true,
        },
      };
      supplementedRows += 1;
    }

    const evidence = getTurnDraftStructureEvidence(liveDrafts);
    attachTurnDraftStructureEvidence(live, evidence ? {
      ...evidence,
      shellVariantSupplementCount: Number(evidence.shellVariantSupplementCount || 0) + supplementedRows,
    } : null);
    return live;
  }

  // Phase 4 Step 2.2: forwards the optional `preScanned` node list to
  // buildLiveTurnDrafts() so refresh() can avoid a redundant scan. Other
  // callers (e.g. boot retry paths) pass nothing and behave identically
  // to the prior implementation.
  function buildTurns(preScanned) {
    const pairing = readBootSplitPairEvidence();
    const liveReconciliation = reconcileBootSplitTurnDrafts(buildLiveTurnDrafts(preScanned), pairing);
    const rawSectionDrafts = buildSectionTurnDrafts();
    const sectionDrafts = Array.isArray(rawSectionDrafts)
      ? reconcileBootSplitTurnDrafts(rawSectionDrafts, pairing).drafts
      : rawSectionDrafts;
    const liveDrafts = supplementSegmentShellVariants(liveReconciliation.drafts, sectionDrafts);
    if (chatAtlasCompleteIndexAuthorityActive()) {
      // Core, Ledger and presentation consumers share one membership source.
      // A proven selected-path overlay is not merely a MiniMap view over the
      // outgoing canonical list; it is the immutable effective branch index.
      const index = getEffectivePresentationIndex()
        || completeTurnIndexAuthorityState.index;
      const authorityDrafts = chatAtlasCompleteIndexCanonicalDrafts(index);
      const boundedLiveDrafts = chatAtlasCompleteIndexLiveDrafts(liveDrafts, index);
      const pendingDrafts = chatAtlasCompleteIndexPendingCanonicalDrafts(index);
      commitTurnDrafts([...authorityDrafts, ...pendingDrafts], boundedLiveDrafts);
      return;
    }
    const sectionAuthority = sectionDraftAuthorityDecision(sectionDrafts, liveDrafts);
    turnState.lastStructureDecision = sectionAuthority;
    const sectionDraftsAreAuthoritative = sectionAuthority.accepted;
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
      legacyCanonicalDrafts = mergeDurableTurnDrafts(baseDrafts, {
        authoritativeReplacement: false,
      });
    }
    const legacyReconciliation = reconcileBootSplitTurnDrafts(legacyCanonicalDrafts, pairing);
    legacyCanonicalDrafts = legacyReconciliation.drafts;
    if (legacyReconciliation.reconciledCount > 0) seedDurableTurnDrafts(legacyCanonicalDrafts);
    const canonicalDrafts = selectChatAtlasCanonicalDrafts(legacyCanonicalDrafts);
    commitTurnDrafts(canonicalDrafts, liveDrafts);
  }

  function reconcileTurnRecordsFromPaginationSnapshot(rows = []) {
    // A proven complete index owns membership and identity. Pagination remains
    // free to patch page/mount presentation through patchTurnPageState(), but
    // its legacy master snapshot must never replace the proven row set.
    if (chatAtlasCompleteIndexAuthorityActive()) {
      turnState.paginationDrafts = null;
      return listTurnRecords();
    }
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

  // ── CV-3.4 complete-turn-index authority (memory-gated) ─────────────────
  // The host-payload parser lives in 0D3a. This layer accepts only its
  // sanitized, globally-proven ID graph, persists that graph separately from
  // MiniMap's legacy row cache, and projects it through the existing canonical
  // merge machinery. The canary switch itself is deliberately memory-only.
  const COMPLETE_TURN_INDEX_CANARY = 'complete-turn-index-projection';
  const COMPLETE_TURN_INDEX_COMPILED_DEFAULT = false;
  const COMPLETE_TURN_INDEX_PREFERENCE_KEY = 'h2o:prm:cgx:chat-atlas:complete-turn-index:enabled:v1';
  const COMPLETE_TURN_INDEX_CACHE_SCHEMA = 1;
  const COMPLETE_TURN_INDEX_CACHE_KEY_PREFIX = 'h2o:prm:cgx:chat-atlas:complete-turn-index:v1:chat:';
  const COMPLETE_TURN_INDEX_STATE_EVENT = 'evt:h2o:complete-turn-index:state';
  const COMPLETE_TURN_INDEX_COMPLETE_STATUSES = Object.freeze([
    'complete-from-cache',
    'complete-from-host-payload',
    'complete-validated',
    'offline-complete-cache',
    'complete-refresh-pending',
    'complete-refreshing',
    'complete-refresh-validated',
    'complete-refresh-failed-cache-preserved',
    'live-pending-overlay',
  ]);
  const COMPLETE_TURN_INDEX_REFRESH_LIMITS = Object.freeze({
    debounceMs: 280,
    timeoutMs: 4500,
    selectedPathConfirmationDelayMs: 1250,
    trustedSelectionWindowMs: 5000,
    diagnosticCauseLimit: 8,
    errorCodeLength: 96,
  });
  const COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS = Object.freeze([
    '9111ad43-3734-4120-94fe-a34c9cd3a1cc',
    '3bdfa68f-a197-422a-a3d4-29f028fc6564',
    'e1d4b63f-0be7-4a51-b074-e3372b71d790',
    'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b',
  ]);
  const COMPLETE_TURN_INDEX_CACHE_KEYS = Object.freeze([
    'schema',
    'chatId',
    'payloadUpdateTime',
    'sourceFingerprint',
    'capturedAt',
    'validatedAt',
    'complete',
    'proof',
    'turns',
  ]);
  const COMPLETE_TURN_INDEX_ROW_KEYS = Object.freeze([
    'order',
    'qId',
    'turnId',
    'answerVariants',
    'primaryAId',
    'noAnswer',
    'stopped',
  ]);

  function chatAtlasCompleteIndexCode(value, fallback = 'complete-index-error', limit = 96) {
    const raw = String(value || '').trim();
    const boundedFallback = String(fallback || 'complete-index-error').slice(0, Math.max(16, Number(limit || 96)));
    if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(raw)) return boundedFallback;
    return raw.slice(0, Math.max(16, Number(limit || 96)));
  }

  // CV-3.4 Gate 4 refresh production seam:begin
  // One debounced coordinator owns all live completion/branch/edit refreshes.
  // It accepts only the already-proven host envelope and publishes only after
  // the IDs-only cache replacement succeeds, keeping membership/cache atomic.
  function createCompleteIndexRefreshCoordinator(adapters = {}, options = {}) {
    const limits = Object.freeze({
      ...COMPLETE_TURN_INDEX_REFRESH_LIMITS,
      ...(options?.limits || {}),
    });
    const state = {
      generation: 0,
      status: 'idle',
      causes: new Set(),
      timer: null,
      timeoutTimer: null,
      promise: null,
      controller: null,
      routeKey: '',
      fetchCount: 0,
      debounceCount: 0,
      coalescedCount: 0,
      staleDiscardCount: 0,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      pendingCount: 0,
      trailingRequired: false,
      trailingRefreshCount: 0,
      authorityUnpersisted: false,
      cacheWriteErrorCode: null,
      selectedPathSignalCount: 0,
      selectedPathAcceptanceCount: 0,
      selectedPathRejectedCount: 0,
      selectedPathCancellationCount: 0,
      selectedPathDeduplicatedCount: 0,
      selectedPathUnconfirmedCount: 0,
      selectedPathLastSignature: null,
      selectedPathPendingEvidence: null,
      selectedPathActiveEvidence: null,
      selectedPathSuppressedSignatures: new Set(),
      selectedPathResultCode: null,
      selectedPathConfirmationTimer: null,
      selectedPathConfirmationEvidence: null,
      selectedPathConfirmationLease: null,
      selectedPathRequestLease: null,
      selectedPathConfirmationTokens: new Set(),
      selectedPathConfirmationScheduledCount: 0,
      selectedPathConfirmationFetchCount: 0,
      selectedPathConfirmationCancelledCount: 0,
      selectedPathActiveRevoked: false,
    };
    const now = () => Math.max(0, Number(adapters?.now?.() ?? Date.now()) || 0);
    const iso = (value) => {
      try { return new Date(value).toISOString(); } catch { return null; }
    };
    const errorCode = (value, fallback = 'complete-index-error') => chatAtlasCompleteIndexCode(
      value,
      fallback,
      limits.errorCodeLength,
    );
    const routeKey = () => String(adapters?.routeKey?.() || '');
    const enabled = () => adapters?.isEnabled?.() === true;
    const selectedPathCause = (cause) => [
      'question-branch-changed',
      'question-selected-path-changed',
      'answer-branch-changed',
      'trusted-native-branch-click',
    ].includes(String(cause || ''));
    // Production always supplies this adapter. The permissive missing-adapter
    // fallback is retained only for older isolated coordinator harnesses; an
    // installed adapter must return exactly true and exceptions fail closed.
    const reconciliationActive = () => {
      if (typeof adapters?.reconciliationActive !== 'function') return true;
      try { return adapters.reconciliationActive() === true; } catch { return false; }
    };
    // Selected-path work is authorized by either owner: the memory-only
    // automatic-reconciliation canary (generic-inspection lane), or trusted
    // capture evidence minted from a real native branch click. The user's own
    // click must be able to drive its single bounded acquisition after a fresh
    // reload, where the canary is always false — otherwise the runtime waits
    // for branch authority that nothing ever fetches.
    const selectedPathTrustAuthorized = (...evidences) => reconciliationActive()
      || evidences.some((evidence) => evidence?.trusted === true && !!evidence?.selectionToken);
    const causeSample = () => Array.from(state.causes).slice(0, Math.max(1, Number(limits.diagnosticCauseLimit || 8)));
    const snapshot = () => Object.freeze({
      status: state.status,
      generation: state.generation,
      fetchCount: state.fetchCount,
      debounceCount: state.debounceCount,
      coalescedCount: state.coalescedCount,
      staleDiscardCount: state.staleDiscardCount,
      pendingCount: state.pendingCount,
      causeSample: Object.freeze(causeSample()),
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      errorCode: state.errorCode,
      trailingRequired: state.trailingRequired,
      trailingRefreshCount: state.trailingRefreshCount,
      authorityUnpersisted: state.authorityUnpersisted,
      cacheWriteErrorCode: state.cacheWriteErrorCode,
      selectedPathSignalCount: state.selectedPathSignalCount,
      selectedPathAcceptanceCount: state.selectedPathAcceptanceCount,
      selectedPathRejectedCount: state.selectedPathRejectedCount,
      selectedPathCancellationCount: state.selectedPathCancellationCount,
      selectedPathDeduplicatedCount: state.selectedPathDeduplicatedCount,
      selectedPathUnconfirmedCount: state.selectedPathUnconfirmedCount,
      selectedPathLastSignature: state.selectedPathLastSignature,
      selectedPathActiveSignature: state.selectedPathActiveEvidence?.signature
        || state.selectedPathPendingEvidence?.signature
        || state.selectedPathConfirmationEvidence?.signature
        || null,
      selectedPathActiveTrusted: (
        state.selectedPathActiveEvidence
        || state.selectedPathPendingEvidence
        || state.selectedPathConfirmationEvidence
      )?.trusted === true,
      selectedPathResultCode: state.selectedPathResultCode,
      selectedPathConfirmationPending: !!state.selectedPathConfirmationTimer,
      selectedPathConfirmationLeaseActive: !!state.selectedPathConfirmationLease,
      selectedPathRequestLeaseActive: !!state.selectedPathRequestLease,
      selectedPathConfirmationScheduledCount: state.selectedPathConfirmationScheduledCount,
      selectedPathConfirmationFetchCount: state.selectedPathConfirmationFetchCount,
      selectedPathConfirmationCancelledCount: state.selectedPathConfirmationCancelledCount,
      timerPending: !!state.timer,
      requestActive: !!state.promise,
    });
    const notify = (status, partial = {}) => {
      state.status = String(status || state.status || 'idle');
      Object.assign(state, partial || {});
      try { adapters?.onState?.(snapshot()); } catch {}
      return snapshot();
    };
    const clearDebounce = () => {
      if (!state.timer) return;
      try { (adapters?.clearTimeout || clearTimeout)(state.timer); } catch {}
      state.timer = null;
    };
    const clearRequestTimeout = () => {
      if (!state.timeoutTimer) return;
      try { (adapters?.clearTimeout || clearTimeout)(state.timeoutTimer); } catch {}
      state.timeoutTimer = null;
    };
    // The lease check (when wired) only fails on genuine supersession by a
    // newer live token; it deliberately ignores the original capture's age.
    // Harnesses/baselines without the lease adapter keep the legacy
    // evidence-current semantics.
    const selectedPathLeaseCheck = (evidence) => {
      const check = adapters?.selectedPathLeaseCurrent || adapters?.selectedPathEvidenceCurrent;
      return check ? check(evidence) : undefined;
    };
    const selectedPathRequestScope = (evidence) => {
      if (typeof adapters?.selectedPathRequestScope !== 'function') return null;
      try {
        const scope = adapters.selectedPathRequestScope(evidence);
        if (!scope || typeof scope !== 'object') return null;
        return Object.freeze({
          requestIdentity: String(scope.requestIdentity || ''),
          token: String(scope.token || ''),
          chatId: String(scope.chatId || ''),
          routeKey: String(scope.routeKey || ''),
          generation: Number(scope.generation || 0),
          staleRevision: Number(scope.staleRevision || 0),
          qId: String(scope.qId || ''),
        });
      } catch {
        return null;
      }
    };
    const selectedPathRequestOwnsIntent = (intent) => {
      const lease = state.selectedPathRequestLease;
      const evidence = lease?.evidence;
      const scope = lease?.scope;
      if (!intent || !lease || !evidence || !scope) return false;
      const token = String(intent.token || '');
      const matchingWork = [
        state.selectedPathPendingEvidence,
        state.selectedPathActiveEvidence,
        state.selectedPathConfirmationEvidence,
      ].some((candidate) => candidate?.selectionToken === token);
      return !!token
        && matchingWork
        && scope.requestIdentity === String(evidence.signature || '')
        && scope.token === token
        && scope.chatId === String(intent.chatId || '')
        && scope.routeKey === String(intent.routeKey || '')
        && scope.generation === Number(intent.generation || 0)
        && scope.staleRevision === Number(intent.staleRevision || 0)
        && scope.qId === String(intent.qId || '')
        && evidence.selectionToken === token
        && evidence.qId === scope.qId
        && lease.routeKey === state.routeKey
        && state.routeKey === routeKey()
        && Number(lease.generation || 0) === Number(adapters?.routeGeneration?.() ?? lease.generation ?? 0)
        && selectedPathLeaseCheck(evidence) !== false;
    };
    const clearSelectedPathRequestLease = (reason) => {
      const lease = state.selectedPathRequestLease;
      if (!lease) return;
      state.selectedPathRequestLease = null;
      adapters?.trace?.('trusted-request-lease-cancelled', {
        reason,
        qId: lease.evidence.qId,
        token: lease.evidence.selectionToken,
      });
    };
    const resolveSelectedPath = (evidence, reason) => {
      if (
        state.selectedPathRequestLease
        && evidence?.selectionToken === state.selectedPathRequestLease.evidence.selectionToken
      ) clearSelectedPathRequestLease(`resolved-${reason}`);
      try { adapters?.onSelectedPathResolved?.(evidence, reason); } catch {}
    };
    const clearSelectedPathConfirmation = (reason = 'cancelled', clearTokens = false) => {
      const evidence = state.selectedPathConfirmationEvidence;
      if (state.selectedPathConfirmationTimer) {
        try { (adapters?.clearTimeout || clearTimeout)(state.selectedPathConfirmationTimer); } catch {}
        state.selectedPathConfirmationCancelledCount += 1;
      }
      state.selectedPathConfirmationTimer = null;
      state.selectedPathConfirmationEvidence = null;
      state.selectedPathConfirmationLease = null;
      if (evidence?.selectionToken) state.selectedPathConfirmationTokens.delete(evidence.selectionToken);
      if (clearTokens) state.selectedPathConfirmationTokens.clear();
      if (evidence) {
        resolveSelectedPath(evidence, reason);
      }
    };
    const cancelSelectedPathReconciliation = (reasonRaw = 'reconciliation-disabled') => {
      const reason = errorCode(reasonRaw, 'reconciliation-disabled');
      const pending = state.selectedPathPendingEvidence;
      const active = state.selectedPathActiveEvidence;
      const requestLease = state.selectedPathRequestLease;
      const confirmation = state.selectedPathConfirmationEvidence;
      const hadSelectedPathWork = !!(
        pending
        || active
        || requestLease
        || confirmation
        || Array.from(state.causes).some(selectedPathCause)
      );
      clearSelectedPathConfirmation(reason, true);
      clearSelectedPathRequestLease(reason);
      state.selectedPathPendingEvidence = null;
      if (active) state.selectedPathActiveRevoked = true;
      state.selectedPathSuppressedSignatures.clear();
      state.selectedPathResultCode = 'selected-path-reconciliation-disabled';
      for (const cause of Array.from(state.causes)) {
        if (selectedPathCause(cause)) state.causes.delete(cause);
      }
      if (!state.causes.size) {
        state.trailingRequired = false;
        if (!state.promise) clearDebounce();
      }
      if (hadSelectedPathWork) state.selectedPathCancellationCount += 1;
      adapters?.trace?.('selected-reconciliation-cancelled', {
        reason,
        qId: pending?.qId || active?.qId || requestLease?.evidence?.qId || confirmation?.qId || '',
      });
      return snapshot();
    };
    const settleSelectedPathGraphPublication = (tokenRaw) => {
      const token = String(tokenRaw || '');
      if (!token) return false;
      const matches = (evidence) => String(evidence?.selectionToken || '') === token;
      const owned = matches(state.selectedPathPendingEvidence)
        || matches(state.selectedPathActiveEvidence)
        || matches(state.selectedPathConfirmationEvidence)
        || matches(state.selectedPathRequestLease?.evidence);
      if (!owned) return false;
      clearSelectedPathConfirmation('complete-graph-path-published', true);
      if (matches(state.selectedPathRequestLease?.evidence)) {
        clearSelectedPathRequestLease('complete-graph-path-published');
      }
      if (matches(state.selectedPathPendingEvidence)) state.selectedPathPendingEvidence = null;
      state.selectedPathSuppressedSignatures.clear();
      state.selectedPathResultCode = 'selected-path-complete-graph-published';
      for (const cause of Array.from(state.causes)) {
        if (selectedPathCause(cause)) state.causes.delete(cause);
      }
      if (!state.causes.size) state.trailingRequired = false;
      return true;
    };
    const cancel = (reason = 'cancelled', status = 'stale-route-discarded') => {
      clearDebounce();
      clearRequestTimeout();
      clearSelectedPathConfirmation(reason, true);
      clearSelectedPathRequestLease(String(reason || 'cancelled'));
      state.generation += 1;
      try { state.controller?.abort?.(errorCode(reason)); } catch {}
      state.controller = null;
      state.promise = null;
      state.causes.clear();
      state.trailingRequired = false;
      state.selectedPathLastSignature = null;
      state.selectedPathPendingEvidence = null;
      state.selectedPathActiveEvidence = null;
      state.selectedPathActiveRevoked = false;
      state.selectedPathSuppressedSignatures.clear();
      state.selectedPathResultCode = null;
      return notify(status, {
        completedAt: iso(now()),
        errorCode: errorCode(reason),
      });
    };
    const markPending = (count = 0) => {
      state.pendingCount = Math.max(0, Number(count || 0) || 0);
      if (!enabled() || !state.pendingCount) return snapshot();
      return notify('live-pending-overlay', { errorCode: null });
    };
    const scheduleSelectedPathConfirmation = (evidence) => {
      const token = String(evidence?.selectionToken || '');
      adapters?.trace?.('confirmation-eligibility-checked', {
        qId: evidence?.qId,
        trusted: evidence?.trusted === true,
        token,
        confirmationAttempt: evidence?.confirmationAttempt === true,
      });
      // Execution-time reconciliation-gate recheck: if the memory-only gate was
      // disabled after a trusted request was accepted but before this confirmation
      // could be scheduled (e.g. flipped off during the debounce window), no
      // confirmation lease is created. Absent adapter (focused coordinator
      // harnesses) is permissive, preserving existing Gate 5 confirmation tests.
      if (!selectedPathTrustAuthorized(evidence)) {
        adapters?.trace?.('confirmation-skipped', {
          reason: 'reconciliation-disabled',
          qId: evidence?.qId,
          token,
        });
        return false;
      }
      if (!evidence?.trusted || !token || evidence?.confirmationAttempt) {
        adapters?.trace?.('confirmation-skipped', {
          reason: !evidence?.trusted
            ? 'evidence-untrusted'
            : (!token ? 'missing-selection-token' : 'already-confirmation-attempt'),
          qId: evidence?.qId,
          token,
        });
        return false;
      }
      // An accepted trusted request has already survived capture->bind->
      // trusted-schedule under the five-second age window; from here on its
      // confirmation is governed by its own bounded lease, NOT by the original
      // capture's age. Scope changes cancel through the coordinator instead.
      if (selectedPathLeaseCheck(evidence) === false) {
        adapters?.trace?.('confirmation-skipped', {
          reason: 'evidence-not-current',
          qId: evidence?.qId,
          token,
        });
        return false;
      }
      if (state.selectedPathConfirmationTokens.has(token)) {
        adapters?.trace?.('confirmation-skipped', {
          reason: 'token-already-confirmed',
          qId: evidence?.qId,
          token,
        });
        return false;
      }
      clearSelectedPathConfirmation('superseded');
      state.selectedPathConfirmationTokens.add(token);
      state.selectedPathConfirmationEvidence = evidence;
      state.selectedPathConfirmationScheduledCount += 1;
      // Freeze the confirmation lease NOW: an immutable bounded record of the
      // scope this confirmation was accepted under. The 1250ms callback
      // validates against this record (token/qId/route/generation), never
      // against the original capture timestamp.
      state.selectedPathConfirmationLease = Object.freeze({
        selectionToken: token,
        qId: String(evidence.qId || ''),
        routeKey: state.routeKey,
        generation: Number(adapters?.routeGeneration?.() ?? 0),
        baselineAnswerId: String(evidence.baselineAnswerId || ''),
        expectChange: evidence.expectChange === true,
        scheduledAt: now(),
        attempt: state.selectedPathConfirmationScheduledCount,
      });
      state.selectedPathResultCode = 'selected-path-confirmation-pending';
      adapters?.trace?.('confirmation-scheduled', {
        qId: evidence.qId,
        token,
        trusted: true,
        cause: evidence.cause,
      });
      state.selectedPathConfirmationTimer = (adapters?.setTimeout || setTimeout)(() => {
        state.selectedPathConfirmationTimer = null;
        const pending = state.selectedPathConfirmationEvidence;
        state.selectedPathConfirmationEvidence = null;
        const lease = state.selectedPathConfirmationLease;
        state.selectedPathConfirmationLease = null;
        const current = pending
          && enabled()
          && state.routeKey === routeKey()
          // Execution-time authorization recheck: a confirmation must still be
          // owned — by the canary or by its own trusted capture evidence —
          // when this delayed callback fires (bounded stale exit below).
          && selectedPathTrustAuthorized(pending)
          && lease
          && lease.selectionToken === pending.selectionToken
          && lease.qId === pending.qId
          && lease.routeKey === state.routeKey
          && Number(lease.generation || 0) === Number(adapters?.routeGeneration?.() ?? lease.generation ?? 0)
          && selectedPathLeaseCheck(pending) !== false;
        if (!current) {
          if (pending) {
            state.selectedPathConfirmationCancelledCount += 1;
            if (pending.selectionToken) state.selectedPathConfirmationTokens.delete(pending.selectionToken);
            resolveSelectedPath(pending, 'stale-confirmation');
          }
          return;
        }
        state.selectedPathSuppressedSignatures.delete(pending.signature);
        state.selectedPathPendingEvidence = Object.freeze({ ...pending, confirmationAttempt: true });
        if (state.causes.size < Number(limits.diagnosticCauseLimit || 8)) state.causes.add(pending.cause);
        adapters?.trace?.('confirmation-started', {
          qId: pending.qId,
          token: pending.selectionToken,
          trusted: pending.trusted === true,
          cause: pending.cause,
        });
        state.selectedPathConfirmationFetchCount += 1;
        void refresh();
      }, Math.max(100, Number(limits.selectedPathConfirmationDelayMs || 1250)));
      return true;
    };
    const refresh = () => {
      clearDebounce();
      if (!enabled()) return Promise.resolve(snapshot());
      if (state.promise) {
        state.coalescedCount += 1;
        return state.promise;
      }
      const retained = adapters?.currentIndex?.() || null;
      const chatId = String(retained?.chatId || adapters?.chatId?.() || '');
      const provider = adapters?.provider?.();
      if (!retained?.complete || !chatId || typeof provider !== 'function') {
        return Promise.resolve(notify('complete-refresh-failed-cache-preserved', {
          errorCode: 'refresh-prerequisite-missing',
          completedAt: iso(now()),
        }));
      }
      let causes = causeSample();
      const queuedSelectedPathWork = !!state.selectedPathPendingEvidence
        || causes.some(selectedPathCause);
      const queuedOrdinaryWork = causes.some((cause) => !selectedPathCause(cause));
      if (queuedSelectedPathWork && !selectedPathTrustAuthorized(state.selectedPathPendingEvidence)) {
        cancelSelectedPathReconciliation('reconciliation-disabled-before-provider');
        causes = causeSample();
        if (!queuedOrdinaryWork) {
          return Promise.resolve(notify('complete-refresh-failed-cache-preserved', {
            errorCode: 'selected-path-reconciliation-disabled',
            completedAt: iso(now()),
          }));
        }
      }
      const Controller = adapters?.AbortController || globalThis.AbortController;
      const controller = typeof Controller === 'function' ? new Controller() : null;
      const generation = state.generation + 1;
      state.generation = generation;
      state.routeKey = routeKey();
      state.controller = controller;
      state.startedAt = iso(now());
      state.completedAt = null;
      state.errorCode = null;
      state.selectedPathActiveEvidence = state.selectedPathPendingEvidence;
      state.selectedPathPendingEvidence = null;
      state.selectedPathActiveRevoked = false;
      if (state.selectedPathActiveEvidence) {
        adapters?.trace?.('selected-refresh-started', {
          cause: state.selectedPathActiveEvidence.cause,
          qId: state.selectedPathActiveEvidence.qId,
          trusted: state.selectedPathActiveEvidence.trusted === true,
          token: state.selectedPathActiveEvidence.selectionToken,
          confirmationAttempt: state.selectedPathActiveEvidence.confirmationAttempt === true,
        });
      }
      causes = causeSample();
      const selectedPathExecution = !!state.selectedPathActiveEvidence
        || causes.some(selectedPathCause);
      const selectedPathExecutionOnly = selectedPathExecution
        && !causes.some((cause) => !selectedPathCause(cause));
      state.causes.clear();
      notify('complete-refreshing');

      const timeoutPromise = new Promise((resolve) => {
        state.timeoutTimer = (adapters?.setTimeout || setTimeout)(() => {
          try { controller?.abort?.('refresh-timeout'); } catch {}
          resolve({ timeout: true });
        }, Math.max(100, Number(limits.timeoutMs || 4500)));
      });
      const providerPromise = Promise.resolve()
        .then(() => {
          // The debounce callback may already have started when the memory-only
          // gate turns off. Selected-only work must still stop immediately before
          // the GET; mixed ordinary work continues without selected evidence.
          if (selectedPathExecution && !selectedPathTrustAuthorized(
            state.selectedPathActiveEvidence,
            state.selectedPathRequestLease?.evidence,
          )) {
            cancelSelectedPathReconciliation('reconciliation-disabled-before-provider');
            if (selectedPathExecutionOnly) {
              return { selectedPathDiscarded: true, phase: 'before-provider' };
            }
            state.selectedPathActiveEvidence = null;
            state.selectedPathActiveRevoked = false;
          }
          state.fetchCount += 1;
          return provider(chatId, { signal: controller?.signal, causes });
        })
        .then((value) => ({ value }), (error) => ({ error }));

      const operation = Promise.race([providerPromise, timeoutPromise])
        .then((outcome) => {
          const current = generation === state.generation && state.routeKey === routeKey() && enabled();
          if (!current) {
            state.staleDiscardCount += 1;
            return snapshot();
          }
          if (outcome?.value?.selectedPathDiscarded === true) {
            return notify('complete-refresh-failed-cache-preserved', {
              errorCode: 'selected-path-reconciliation-disabled',
              completedAt: iso(now()),
            });
          }
          if (outcome?.timeout) {
            return notify('complete-refresh-failed-cache-preserved', {
              errorCode: 'refresh-timeout',
              completedAt: iso(now()),
            });
          }
          if (outcome?.error) {
            return notify('complete-refresh-failed-cache-preserved', {
              errorCode: errorCode(outcome.error?.code, 'provider-failed'),
              completedAt: iso(now()),
            });
          }
          const result = outcome?.value;
          const normalized = result?.ok === true
            ? adapters?.normalize?.(result.index, chatId)
            : { ok: false, errorCode: result?.errorCode || 'full-index-unavailable' };
          if (!normalized?.ok || !normalized?.envelope) {
            return notify('complete-refresh-failed-cache-preserved', {
              errorCode: errorCode(normalized?.errorCode || 'complete-index-proof-invalid'),
              completedAt: iso(now()),
            });
          }
          const incoming = normalized.envelope;
          const revisionOrder = Number(adapters?.compareRevision?.(
            incoming.payloadUpdateTime,
            retained.payloadUpdateTime,
          ) || 0);
          if (revisionOrder < 0) {
            return notify('complete-refresh-failed-cache-preserved', {
              errorCode: 'older-host-payload',
              completedAt: iso(now()),
            });
          }
          // A selected-only GET may already be in flight when qualification is
          // disabled. Preserve the existing proven authority byte-for-byte: no
          // confirmation, cache write, publication, canonical rebuild, or primary
          // mutation may consume that result. Mixed ordinary refreshes remain
          // eligible, but their selected evidence is discarded.
          if (selectedPathExecution && (
            !selectedPathTrustAuthorized(
              state.selectedPathActiveEvidence,
              state.selectedPathRequestLease?.evidence,
            )
            || state.selectedPathActiveRevoked
          )) {
            cancelSelectedPathReconciliation('reconciliation-disabled-before-publication');
            if (selectedPathExecutionOnly) {
              return notify('complete-refresh-failed-cache-preserved', {
                errorCode: 'selected-path-reconciliation-disabled',
                completedAt: iso(now()),
              });
            }
            state.selectedPathActiveEvidence = null;
            state.selectedPathActiveRevoked = false;
          }
          // The accepted trusted request lease survives outcomes that consume
          // or bypass the active evidence (races, discarded older payloads):
          // when no active evidence reached this outcome, a still-valid lease
          // supplies the trusted evidence so the initial-refresh completion
          // and the single delayed confirmation are governed by the lease —
          // never by the original capture's age.
          const requestLease = state.selectedPathRequestLease;
          const requestLeaseUsable = !!requestLease
            && !state.selectedPathActiveEvidence
            && state.routeKey === routeKey()
            && requestLease.routeKey === state.routeKey
            && Number(requestLease.generation || 0) === Number(adapters?.routeGeneration?.() ?? requestLease.generation ?? 0)
            && !state.selectedPathConfirmationTimer
            && !state.selectedPathConfirmationTokens.has(requestLease.evidence.selectionToken)
            && selectedPathLeaseCheck(requestLease.evidence) !== false;
          const selectedEvidence = state.selectedPathActiveEvidence
            || (requestLeaseUsable ? requestLease.evidence : null);
          if (requestLeaseUsable && selectedEvidence) {
            adapters?.trace?.('trusted-request-lease-retained', {
              qId: selectedEvidence.qId,
              token: selectedEvidence.selectionToken,
            });
          }
          const selectedPathConfirmed = !!selectedEvidence
            && adapters?.selectedPathConfirmed?.(incoming, selectedEvidence) === true;
          // A capture-driven request confirms strictly on the host primary
          // leaving its baseline (expectChange). While it has NOT yet — even if
          // an unrelated downstream turn advanced the payload revision — the
          // switch is still pending, so it must still schedule its one delayed
          // confirmation rather than being dropped by the revision===0 gate the
          // generic observed-answer path relies on.
          const selectedPathUnchanged = !!selectedEvidence
            && !selectedPathConfirmed
            && (
              selectedEvidence.expectChange === true
              || (
                revisionOrder === 0
                && String(incoming?.sourceFingerprint || '') === String(retained?.sourceFingerprint || '')
              )
            );
          if (selectedPathConfirmed) {
            state.selectedPathSuppressedSignatures.delete(selectedEvidence.signature);
            if (selectedEvidence.selectionToken) {
              state.selectedPathConfirmationTokens.delete(selectedEvidence.selectionToken);
            }
            state.selectedPathResultCode = null;
            resolveSelectedPath(selectedEvidence, 'confirmed');
          } else if (selectedPathUnchanged) {
            adapters?.trace?.('selected-refresh-unchanged', {
              cause: selectedEvidence.cause,
              qId: selectedEvidence.qId,
              trusted: selectedEvidence.trusted === true,
              token: selectedEvidence.selectionToken,
              confirmationAttempt: selectedEvidence.confirmationAttempt === true,
            });
            state.selectedPathUnconfirmedCount += 1;
            if (state.selectedPathSuppressedSignatures.size >= Number(limits.diagnosticCauseLimit || 8)) {
              state.selectedPathSuppressedSignatures.delete(state.selectedPathSuppressedSignatures.values().next().value);
            }
            state.selectedPathSuppressedSignatures.add(selectedEvidence.signature);
            const confirmationScheduled = scheduleSelectedPathConfirmation(selectedEvidence);
            if (!confirmationScheduled) {
              state.selectedPathResultCode = selectedEvidence?.confirmationAttempt
                ? 'selected-path-confirmation-unconfirmed'
                : 'selected-path-unconfirmed-unchanged';
              if (selectedEvidence?.confirmationAttempt) {
                if (selectedEvidence.selectionToken) {
                  state.selectedPathConfirmationTokens.delete(selectedEvidence.selectionToken);
                }
                resolveSelectedPath(selectedEvidence, 'unconfirmed');
              }
            }
          }
          const write = adapters?.writeCache?.(incoming) || { ok: false, status: 'cache-write-failed' };
          if (!write.ok) {
            adapters?.publish?.(incoming, 'host-refresh-unpersisted');
            state.pendingCount = Math.max(0, Number(adapters?.pendingCount?.() || 0) || 0);
            return notify('complete-refresh-validated', {
              errorCode: errorCode(write.status, 'cache-write-failed'),
              authorityUnpersisted: true,
              cacheWriteErrorCode: errorCode(write.status, 'cache-write-failed'),
              completedAt: iso(now()),
            });
          }
          adapters?.publish?.(incoming, 'host-refresh');
          state.pendingCount = Math.max(0, Number(adapters?.pendingCount?.() || 0) || 0);
          return notify('complete-refresh-validated', {
            errorCode: null,
            authorityUnpersisted: false,
            cacheWriteErrorCode: null,
            completedAt: iso(now()),
          });
        })
        .finally(() => {
          if (generation !== state.generation) return;
          clearRequestTimeout();
          state.controller = null;
          state.promise = null;
          if (
            state.selectedPathActiveEvidence?.confirmationAttempt
            && state.selectedPathResultCode === 'selected-path-confirmation-pending'
          ) {
            state.selectedPathResultCode = 'selected-path-confirmation-failed';
            if (state.selectedPathActiveEvidence.selectionToken) {
              state.selectedPathConfirmationTokens.delete(state.selectedPathActiveEvidence.selectionToken);
            }
            resolveSelectedPath(state.selectedPathActiveEvidence, 'failed');
          }
          state.selectedPathActiveEvidence = null;
          state.selectedPathActiveRevoked = false;
          const shouldTrail = state.trailingRequired
            && state.causes.size > 0
            && enabled()
            && state.routeKey === routeKey();
          state.trailingRequired = false;
          if (shouldTrail && !state.timer) {
            state.trailingRefreshCount += 1;
            state.debounceCount += 1;
            notify('complete-refresh-pending', { errorCode: null });
            state.timer = (adapters?.setTimeout || setTimeout)(() => {
              state.timer = null;
              void refresh();
            }, Math.max(0, Number(limits.debounceMs || 280)));
          }
        });
      state.promise = operation;
      return operation;
    };
    const schedule = (cause = 'turn-settled', opts = {}) => {
      if (!enabled()) return Promise.resolve(snapshot());
      const boundedCause = chatAtlasCompleteIndexCode(cause, 'turn-settled', 64);
      const rawEvidence = opts?.selectedPathEvidence;
      const rawSignature = String(rawEvidence?.signature || '').trim();
      const selectedPathEvidence = /^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(rawSignature)
        ? Object.freeze({
          signature: rawSignature,
          cause: boundedCause,
          qId: String(rawEvidence?.qId || '').slice(0, 256),
          observedAnswerId: String(rawEvidence?.observedAnswerId || '').slice(0, 256),
          trusted: rawEvidence?.trusted === true,
          selectionToken: /^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(String(rawEvidence?.selectionToken || ''))
            ? String(rawEvidence.selectionToken)
            : '',
          confirmationAttempt: rawEvidence?.confirmationAttempt === true,
          baselineAnswerId: String(rawEvidence?.baselineAnswerId || '').slice(0, 256),
          expectChange: rawEvidence?.expectChange === true,
        })
        : null;
      const selectedPathWork = selectedPathCause(boundedCause);
      if (selectedPathWork && !selectedPathTrustAuthorized(selectedPathEvidence)) {
        if (selectedPathEvidence) {
          state.selectedPathSignalCount += 1;
          state.selectedPathLastSignature = selectedPathEvidence.signature;
        }
        state.selectedPathRejectedCount += 1;
        adapters?.trace?.('selected-schedule-attempt', {
          cause: boundedCause,
          qId: selectedPathEvidence?.qId || '',
          trusted: selectedPathEvidence?.trusted === true,
          token: selectedPathEvidence?.selectionToken || '',
          signature: selectedPathEvidence?.signature || '',
          accepted: false,
          reason: 'reconciliation-disabled',
        });
        return Promise.resolve(snapshot());
      }
      if (selectedPathEvidence) {
        state.selectedPathSignalCount += 1;
        state.selectedPathLastSignature = selectedPathEvidence.signature;
        const duplicate = state.selectedPathSuppressedSignatures.has(selectedPathEvidence.signature)
          || selectedPathEvidence.signature === state.selectedPathActiveEvidence?.signature
          || selectedPathEvidence.signature === state.selectedPathPendingEvidence?.signature
          || selectedPathEvidence.signature === state.selectedPathConfirmationEvidence?.signature;
        adapters?.trace?.('selected-schedule-attempt', {
          cause: boundedCause,
          qId: selectedPathEvidence.qId,
          trusted: selectedPathEvidence.trusted,
          token: selectedPathEvidence.selectionToken,
          signature: selectedPathEvidence.signature,
          accepted: !duplicate,
        });
        if (duplicate) {
          state.selectedPathDeduplicatedCount += 1;
          adapters?.trace?.('selected-schedule-deduplicated', {
            cause: boundedCause,
            qId: selectedPathEvidence.qId,
            trusted: selectedPathEvidence.trusted,
            token: selectedPathEvidence.selectionToken,
            signature: selectedPathEvidence.signature,
          });
          return state.promise || Promise.resolve(snapshot());
        }
        // A trusted capture-driven request in flight (pending, confirming, or
        // actively refreshing) is authoritative. A generic UNTRUSTED signal —
        // e.g. a downstream turn re-rendering during the branch transition —
        // must never replace it as the pending evidence, so it cannot divert
        // the refresh away from the captured qId. It deduplicates against the
        // capture-driven request instead of clobbering it.
        const trustedInFlight = state.selectedPathPendingEvidence?.trusted === true
          || state.selectedPathConfirmationEvidence?.trusted === true
          || state.selectedPathActiveEvidence?.trusted === true;
        if (trustedInFlight && selectedPathEvidence.trusted !== true) {
          state.selectedPathDeduplicatedCount += 1;
          adapters?.trace?.('selected-schedule-deduplicated', {
            cause: boundedCause,
            qId: selectedPathEvidence.qId,
            trusted: false,
            signature: selectedPathEvidence.signature,
            reason: 'trusted-request-in-flight',
          });
          return state.promise || Promise.resolve(snapshot());
        }
        // Only a genuinely NEWER trusted selection (non-empty differing token)
        // may supersede a pending trusted confirmation. Token-less untrusted
        // evidence — e.g. a partial re-render pass where the switched turn is
        // virtualized out while a downstream turn still differs — must not
        // cancel the confirmation or consume the intent it belongs to.
        if (
          state.selectedPathConfirmationEvidence
          && selectedPathEvidence.selectionToken
          && selectedPathEvidence.selectionToken !== state.selectedPathConfirmationEvidence.selectionToken
        ) clearSelectedPathConfirmation('superseded');
        state.selectedPathAcceptanceCount += 1;
        state.selectedPathPendingEvidence = selectedPathEvidence;
        state.selectedPathResultCode = null;
        // ── Trusted request lease: frozen at coordinator ACCEPTANCE, before
        // the initial provider refresh begins. The five-second capture window
        // governed capture->bind->coordinator-acceptance; from here on this
        // immutable bounded record — never the capture's age — governs the
        // initial refresh completion and the single delayed confirmation.
        if (selectedPathEvidence.trusted === true && selectedPathEvidence.selectionToken) {
          if (
            state.selectedPathRequestLease
            && state.selectedPathRequestLease.evidence.selectionToken !== selectedPathEvidence.selectionToken
          ) clearSelectedPathRequestLease('superseded-by-newer-trusted');
          state.selectedPathRequestLease = Object.freeze({
            evidence: selectedPathEvidence,
            scope: selectedPathRequestScope(selectedPathEvidence),
            routeKey: routeKey(),
            generation: Number(adapters?.routeGeneration?.() ?? 0),
            acceptedAt: now(),
          });
          adapters?.trace?.('trusted-request-lease-created', {
            qId: selectedPathEvidence.qId,
            token: selectedPathEvidence.selectionToken,
            cause: boundedCause,
          });
        }
      }
      if (state.causes.size < Number(limits.diagnosticCauseLimit || 8)) state.causes.add(boundedCause);
      if (state.promise) {
        state.coalescedCount += 1;
        state.trailingRequired = true;
        return state.promise;
      }
      if (opts?.immediate === true) return refresh();
      if (state.timer) {
        state.coalescedCount += 1;
        return Promise.resolve(snapshot());
      }
      state.debounceCount += 1;
      notify('complete-refresh-pending', { errorCode: null });
      state.timer = (adapters?.setTimeout || setTimeout)(() => {
        state.timer = null;
        void refresh();
      }, Math.max(0, Number(limits.debounceMs || 280)));
      return Promise.resolve(snapshot());
    };
    return Object.freeze({
      schedule,
      refresh,
      cancel,
      cancelSelectedPathReconciliation,
      settleSelectedPathGraphPublication,
      markPending,
      getStatus: snapshot,
      selectedPathRequestOwnsIntent,
      limits,
    });
  }
  // CV-3.4 Gate 4 refresh production seam:end

  let completeIndexRefreshCoordinator = null;

  const completeTurnIndexAuthorityState = {
    enabled: false,
    status: 'disabled',
    chatId: null,
    routeKey: '',
    generation: 0,
    fetchCount: 0,
    cacheReadCount: 0,
    cacheWriteCount: 0,
    cacheWriteSkippedUnchangedCount: 0,
    cacheWriteFailureCount: 0,
    authorityUnpersisted: false,
    cacheWriteErrorCode: null,
    setterCallCount: 0,
    automaticSetterCallCount: 0,
    staleDiscardCount: 0,
    startedAt: null,
    completedAt: null,
    errorCode: null,
    diagnosticStatus: null,
    index: null,
    indexSource: null,
    cacheChecked: false,
    cacheRaw: null,
    attempted: false,
    promise: null,
    controller: null,
    pendingDrafts: new Map(),
    pendingObservedAt: new Map(),
    pendingStateNotifyQueued: false,
    refreshListenerBound: false,
    refreshListenerRegistrationCount: 0,
    trustedSelectionSequence: 0,
    trustedSelectionCaptureCount: 0,
    trustedSelectedPathIntent: null,
    trustedNativeReconcileTask: null,
    // Round 1 passive branch-stale signal. IDs-only and memory-only: a valid
    // native Previous/Next capture marks the current complete projection as
    // potentially stale without authorizing any reconciliation work.
    branchSelectionStale: false,
    branchSelectionStaleRevision: 0,
    branchSelectionStaleQId: null,
    branchSelectionStaleChatId: null,
    branchSelectionStaleRouteKey: '',
    branchSelectionStaleGeneration: 0,
    branchExpansionLease: null,
    branchExpansionTimeoutTask: null,
    branchExpansionRetryTask: null,
    branchExpansionFailure: null,
    branchExpansionState: 'idle',
    branchExpansionReason: null,
    branchExpansionAnchorReturned: false,
    branchExpansionPriorCount: 0,
    branchExpansionPriorFingerprint: '',
    branchExpansionTargetCount: 0,
    branchExpansionExpectedFingerprint: '',
    branchExpansionRequiredPageNums: Object.freeze([]),
    branchExpansionSequence: 0,
    // Round 1: automatic native Previous/Next response-branch reconciliation is
    // DEFERRED to Round 2. This gate is independent of `enabled`, of the
    // persisted complete-turn preference, and of the memory canary; it defaults
    // false, is never persisted, and is flipped only by the memory-only
    // qualification setter below. Enabling the complete-turn projection never
    // enables reconciliation. Trusted native-click capture + canonical qId
    // binding + tracing stay available (for future passive stale-state
    // signaling); only the automatic reconciliation SCHEDULE is gated.
    autoBranchReconciliationEnabled: false,
    branchTransitionSuppressedLiveAppendCount: 0,
    branchStaleLastClearReason: null,
    nativeConvergenceState: null,
    nativeConvergenceActivating: false,
    branchTransactionState: null,
    branchTransactionSeq: 0,
    branchTransactionTrace: [],
    autoBranchReconciliationSetterCallCount: 0,
    preferenceResolved: false,
    preferenceStoredValue: null,
    preferenceResolution: 'unresolved',
    activationSource: 'compiled-default',
    preferenceReadCount: 0,
    preferenceWriteCount: 0,
    preferenceClearCount: 0,
    preferenceWriteFailureCount: 0,
    preferenceReadErrorCode: null,
    preferenceWriteErrorCode: null,
    preferenceSetterCallCount: 0,
    bootApplyCount: 0,
    bootActivationCount: 0,
  };

  const selectedPathAcquisitionState = {
    status: 'inactive',
    reason: 'runtime-initialized',
    token: null,
    anchorQId: null,
    anchorSelectedAId: null,
    priorAnswerId: null,
    chatId: null,
    routeKey: '',
    generation: 0,
    staleRevision: 0,
    graph: null,
    refetchAttemptedForToken: null,
    refetchActiveForToken: null,
    path: null,
    proof: null,
    provenAt: null,
    evaluatedLedgerVersion: 0,
    evaluationKey: '',
    lastDerivationDiagnostics: null,
    lastPublicationDecision: null,
  };

  const selectedPathOverlayState = {
    status: 'inactive',
    reason: 'runtime-initialized',
    token: null,
    chatId: null,
    routeKey: '',
    generation: 0,
    staleRevision: 0,
    canonicalFingerprint: '',
    acquisitionProofIdentity: '',
    acquisitionPathIdentity: '',
    evaluationKey: '',
    anchorQId: null,
    activatedAt: null,
    pathLength: 0,
    index: null,
    byQId: null,
    byAId: null,
    proof: null,
  };

  // CV-3.4 Gate 5 diagnostic-only trusted-branch lifecycle trace. Memory-only,
  // IDs-only (identifiers, hashes, reason codes — never message/payload content,
  // never the raw selection token). The persistent "last event" fields survive
  // intent clearing and route resets and reset only on runtime recreation. The
  // capped entry window re-anchors on each trusted capture so the FIRST
  // divergence after a live click can never be evicted by later signal storms.
  const COMPLETE_TURN_INDEX_LIFECYCLE_TRACE_LIMIT = 32;
  const completeTurnIndexLifecycleDiagnostics = {
    traceSequence: 0,
    traceWindowStartedAt: 0,
    traceDroppedCount: 0,
    trace: [],
    trustedSelectionLastCaptureTokenHash: null,
    trustedSelectionLastCaptureDirection: null,
    trustedSelectionBindAttemptCount: 0,
    trustedSelectionBindSuccessCount: 0,
    trustedSelectionLastBoundQId: null,
    trustedSelectionClearCount: 0,
    trustedSelectionLastClearReason: null,
    trustedSelectionLastClearQId: null,
    selectedPathTrustedScheduleAttemptCount: 0,
    selectedPathTrustedScheduleAcceptedCount: 0,
    selectedPathLastScheduleTrusted: null,
    selectedPathLastScheduleQId: null,
    selectedPathLastScheduleCause: null,
    selectedPathConfirmationEligibilityCheckCount: 0,
    selectedPathConfirmationSkipCount: 0,
    selectedPathConfirmationLastSkipReason: null,
  };

  function chatAtlasTraceTrustedLifecycle(eventRaw, detail = {}) {
    const diag = completeTurnIndexLifecycleDiagnostics;
    const event = chatAtlasCompleteIndexCode(eventRaw, 'lifecycle-event', 48);
    const tokenHash = detail?.token
      ? `djb2:${chatAtlasCompleteIndexStableHash(String(detail.token))}`
      : '';
    const chatHash = detail?.chat
      ? `djb2:${chatAtlasCompleteIndexStableHash(String(detail.chat))}`
      : '';
    if (event === 'trusted-capture-created') {
      diag.trace.length = 0;
      diag.traceDroppedCount = 0;
      diag.traceWindowStartedAt = Date.now();
      diag.trustedSelectionLastCaptureTokenHash = tokenHash || null;
      diag.trustedSelectionLastCaptureDirection = String(detail?.direction || '') || null;
    } else if (event === 'trusted-bind-attempt') {
      diag.trustedSelectionBindAttemptCount += 1;
    } else if (event === 'trusted-bind-success') {
      diag.trustedSelectionBindSuccessCount += 1;
      diag.trustedSelectionLastBoundQId = String(detail?.qId || '') || null;
    } else if (event === 'trusted-intent-cleared' || event === 'trusted-intent-expired') {
      diag.trustedSelectionClearCount += 1;
      diag.trustedSelectionLastClearReason = chatAtlasCompleteIndexCode(detail?.reason, event, 64);
      diag.trustedSelectionLastClearQId = String(detail?.qId || '') || null;
    } else if (event === 'selected-schedule-attempt') {
      diag.selectedPathLastScheduleTrusted = detail?.trusted === true;
      diag.selectedPathLastScheduleQId = String(detail?.qId || '') || null;
      diag.selectedPathLastScheduleCause = chatAtlasCompleteIndexCode(detail?.cause, 'selected-path-changed', 64);
      if (detail?.trusted === true) {
        diag.selectedPathTrustedScheduleAttemptCount += 1;
        if (detail?.accepted === true) diag.selectedPathTrustedScheduleAcceptedCount += 1;
      }
    } else if (event === 'confirmation-eligibility-checked') {
      diag.selectedPathConfirmationEligibilityCheckCount += 1;
    } else if (event === 'confirmation-skipped') {
      diag.selectedPathConfirmationSkipCount += 1;
      diag.selectedPathConfirmationLastSkipReason = chatAtlasCompleteIndexCode(detail?.reason, 'confirmation-skipped', 64);
    }
    diag.traceSequence += 1;
    if (diag.trace.length >= COMPLETE_TURN_INDEX_LIFECYCLE_TRACE_LIMIT) {
      diag.traceDroppedCount += 1;
      return;
    }
    if (!diag.traceWindowStartedAt) diag.traceWindowStartedAt = Date.now();
    const entry = {
      seq: diag.traceSequence,
      event,
      at: Math.max(0, Date.now() - Number(diag.traceWindowStartedAt || 0)),
      gen: Number(completeTurnIndexAuthorityState.generation || 0),
    };
    if (tokenHash) entry.tokenHash = tokenHash;
    if (chatHash) entry.chatHash = chatHash;
    if (detail?.qId) entry.qId = String(detail.qId).slice(0, 256);
    if (detail?.boundQId) entry.boundQId = String(detail.boundQId).slice(0, 256);
    if (detail?.direction) entry.direction = String(detail.direction).slice(0, 16);
    if (detail?.trusted !== undefined) entry.trusted = detail.trusted === true;
    if (detail?.signature) entry.signature = chatAtlasCompleteIndexCode(detail.signature, 'signature-invalid', 96);
    if (detail?.reason) entry.reason = chatAtlasCompleteIndexCode(detail.reason, 'reason-invalid', 64);
    if (detail?.cause) entry.cause = chatAtlasCompleteIndexCode(detail.cause, 'cause-invalid', 64);
    if (detail?.resultCode) entry.resultCode = chatAtlasCompleteIndexCode(detail.resultCode, 'result-invalid', 96);
    if (detail?.confirmationAttempt !== undefined) entry.confirmationAttempt = detail.confirmationAttempt === true;
    if (Number.isFinite(detail?.age)) entry.age = Math.max(0, Number(detail.age));
    diag.trace.push(Object.freeze(entry));
  }

  function chatAtlasCompleteIndexIdentity(value) {
    const id = String(value || '').trim();
    return /^[a-z0-9._:-]{1,256}$/i.test(id) ? id : '';
  }

  function chatAtlasCompleteIndexStableHash(raw) {
    const value = String(raw || '');
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return Math.abs(hash >>> 0).toString(36);
  }

  function getSelectedPathAcquisitionStatus() {
    const token = String(selectedPathAcquisitionState.token || '');
    const status = {
      status: selectedPathAcquisitionState.status,
      reason: selectedPathAcquisitionState.reason,
      pathLength: Array.isArray(selectedPathAcquisitionState.path)
        ? selectedPathAcquisitionState.path.length
        : 0,
      anchorQId: selectedPathAcquisitionState.anchorQId,
      provenAt: selectedPathAcquisitionState.provenAt,
    };
    Object.defineProperty(status, 'token', {
      value: token ? `djb2:${chatAtlasCompleteIndexStableHash(token)}` : null,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    return chatAtlasFreeze(status);
  }

  function getSelectedPathDerivationDiagnostics() {
    const transaction = chatAtlasBranchTransactionCurrent();
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const candidate = intent?.returnTargetCandidate || null;
    const retainedGraph = selectedPathAcquisitionState.graph;
    const effective = getEffectivePresentationIndex();
    const effectiveTurns = Array.isArray(effective?.turns) ? effective.turns : [];
    const ledgerRecords = buildChatAtlasLedgerCanonicalRecords();
    return chatAtlasFreeze({
      version: 1,
      acquisition: getSelectedPathAcquisitionStatus(),
      transactionState: String(transaction?.state || 'none'),
      transactionReason: String(transaction?.reason || '') || null,
      effectiveCount: effectiveTurns.length,
      effectiveFingerprint: String(effective?.sourceFingerprint || '') || null,
      coreCount: Array.isArray(turnState.turns) ? turnState.turns.length : 0,
      ledgerCount: Array.isArray(ledgerRecords) ? ledgerRecords.length : 0,
      page2Count: effectiveTurns.length > CHAT_ATLAS_PAGE_SIZE
        ? effectiveTurns.slice(CHAT_ATLAS_PAGE_SIZE).length
        : 0,
      overlayActive: chatAtlasSelectedPathOverlayCurrent(),
      retainedGraph: {
        available: !!retainedGraph,
        captureIdentity: String(retainedGraph?.captureIdentity || '') || null,
        nodeCount: Array.isArray(retainedGraph?.identityGraph?.nodes)
          ? retainedGraph.identityGraph.nodes.length
          : 0,
        scopeCurrent: !!retainedGraph
          && retainedGraph.chatId === completeTurnIndexAuthorityState.chatId
          && retainedGraph.routeKey === completeTurnIndexAuthorityState.routeKey
          && retainedGraph.generation === Number(completeTurnIndexAuthorityState.generation || 0),
      },
      returnTargetCandidate: candidate ? {
        classification: String(candidate.classification || ''),
        reason: String(candidate.reason || ''),
        targetVariantAnswerId: String(candidate.targetVariantAnswerId || '') || null,
        graphCaptureIdentity: String(candidate.graphCaptureIdentity || '') || null,
        derivedTargetCount: Number(candidate.derivedTargetCount || 0),
      } : null,
      publicationDecision: selectedPathAcquisitionState.lastPublicationDecision,
      derivation: selectedPathAcquisitionState.lastDerivationDiagnostics,
    });
  }

  // ── Publication ownership (Stage 2C-2aj2) ────────────────────────────────
  // Once a trusted token's branch transaction carries a genuinely successful
  // publication decision, that acquisition record is publication-owned: no
  // ordinary lifecycle writer may demote it or clear its proof/path/anchor.
  // Only an explicit reset boundary may. The rule lives in the two mutating
  // primitives (and the one direct mutation in chatAtlasRetainIdentityGraph)
  // so it cannot be bypassed by adding another call site.
  //
  // Genuine reset boundaries, classified from the architecture's own callers:
  // route change, generation/authority reset, chat/route ownership mismatch,
  // canonical-fingerprint replacement, and identity-graph scope drift. Every
  // other reason is ordinary lifecycle cleanup.
  const CHAT_ATLAS_ACQUISITION_RESET_REASONS = Object.freeze(new Set([
    'route-changed',
    'authority-reset',
    'route-reset',
    'chat-mismatch',
    'route-mismatch',
    'generation-mismatch',
    'canonical-fingerprint-changed',
    'identity-graph-refetch-scope-drift',
    'selected-path-ownership-changed',
  ]));

  function chatAtlasAcquisitionResetBoundary(reason) {
    return CHAT_ATLAS_ACQUISITION_RESET_REASONS.has(
      chatAtlasCompleteIndexCode(reason, 'cleared', 64),
    );
  }

  // The record currently held is publication-owned when its own token has a
  // successful publication decision still in scope.
  function chatAtlasAcquisitionPublicationOwned() {
    const token = String(selectedPathAcquisitionState.token || '');
    if (!token) return false;
    return chatAtlasSelectedPathPublishedForToken(token);
  }

  function chatAtlasClearSelectedPathAcquisition(reason = 'cleared', options = {}) {
    // Ordinary lifecycle cleanup — trusted-intent disappearance, expiry,
    // supersession — must leave a published selection intact.
    if (
      !chatAtlasAcquisitionResetBoundary(reason)
      && chatAtlasAcquisitionPublicationOwned()
    ) return getSelectedPathAcquisitionStatus();
    const retainedGraph = options?.preserveGraph === true
      ? selectedPathAcquisitionState.graph
      : null;
    selectedPathAcquisitionState.status = 'inactive';
    selectedPathAcquisitionState.reason = chatAtlasCompleteIndexCode(reason, 'cleared', 64);
    selectedPathAcquisitionState.token = null;
    selectedPathAcquisitionState.anchorQId = null;
    selectedPathAcquisitionState.anchorSelectedAId = null;
    selectedPathAcquisitionState.priorAnswerId = null;
    selectedPathAcquisitionState.chatId = null;
    selectedPathAcquisitionState.routeKey = '';
    selectedPathAcquisitionState.generation = 0;
    selectedPathAcquisitionState.staleRevision = 0;
    selectedPathAcquisitionState.graph = retainedGraph;
    if (options?.resetRefetchGuard === true) {
      selectedPathAcquisitionState.refetchAttemptedForToken = null;
    }
    selectedPathAcquisitionState.refetchActiveForToken = null;
    selectedPathAcquisitionState.path = null;
    selectedPathAcquisitionState.proof = null;
    selectedPathAcquisitionState.provenAt = null;
    selectedPathAcquisitionState.evaluatedLedgerVersion = 0;
    selectedPathAcquisitionState.evaluationKey = '';
    return getSelectedPathAcquisitionStatus();
  }

  function chatAtlasSelectedPathFail(reason, intent, selectedAnswerId = '') {
    // Two distinct situations reach this function while a transaction is open,
    // and they require opposite handling.
    //
    // A GENUINE derivation failure (anchor-not-in-graph, fork-unresolved,
    // descent-variant-ambiguous, …) must still be recorded while the
    // transaction is pending: that record is what keeps containment and stops
    // a 20/21 hybrid settling on the outgoing branch. CV-3.8 owns that
    // invariant and it is deliberately left untouched.
    //
    // 'selected-answer-not-changed' is not a derivation failure at all. It is
    // an artefact of re-deriving from live DOM after the native branch has
    // already switched: the anchor's mounted answer then legitimately equals
    // the intent's prior answer. The branch transaction is opened
    // synchronously inside the trusted click, a macrotask before any
    // publication evidence exists, so the pending transaction is the only
    // signal available this early. Suppressing only this reason leaves every
    // genuine failure path exactly as it was.
    const failToken = String(intent?.token || '')
      || String(selectedPathAcquisitionState.token || '');
    const transaction = completeTurnIndexAuthorityState.branchTransactionState;
    const matchesTransaction = !!failToken
      && !!transaction
      && String(transaction.token || '') === failToken;
    if (
      matchesTransaction
      && transaction.state === 'pending'
      && chatAtlasCompleteIndexCode(reason, 'selected-path-failed', 64) === 'selected-answer-not-changed'
    ) return getSelectedPathAcquisitionStatus();
    // A published transaction proves nothing on its own; only a genuinely
    // publication-owned record is protected here.
    if (chatAtlasAcquisitionPublicationOwned()) {
      return getSelectedPathAcquisitionStatus();
    }
    chatAtlasBranchTransactionTrace('acq-fail', { reason });
    selectedPathAcquisitionState.status = 'failed';
    selectedPathAcquisitionState.reason = chatAtlasCompleteIndexCode(reason, 'selected-path-failed', 64);
    selectedPathAcquisitionState.token = String(intent?.token || '') || null;
    selectedPathAcquisitionState.anchorQId = chatAtlasCompleteIndexIdentity(intent?.qId) || null;
    selectedPathAcquisitionState.anchorSelectedAId = chatAtlasCompleteIndexIdentity(selectedAnswerId) || null;
    selectedPathAcquisitionState.priorAnswerId = chatAtlasCompleteIndexIdentity(intent?.priorAnswerId) || null;
    selectedPathAcquisitionState.chatId = String(intent?.chatId || '') || null;
    selectedPathAcquisitionState.routeKey = String(intent?.routeKey || '');
    selectedPathAcquisitionState.generation = Number(intent?.generation || 0);
    selectedPathAcquisitionState.staleRevision = Number(intent?.staleRevision || 0);
    selectedPathAcquisitionState.path = null;
    selectedPathAcquisitionState.proof = null;
    selectedPathAcquisitionState.provenAt = null;
    selectedPathAcquisitionState.evaluatedLedgerVersion = Number(chatAtlasLedgerState.version || 0);
    return getSelectedPathAcquisitionStatus();
  }

  function chatAtlasSelectedPathOverlayProofIdentity(proof) {
    if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return '';
    return `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
      proof.anchorQId,
      proof.anchorSelectedAId,
      proof.rootNodeId,
      proof.tailNodeId,
      proof.pathLength,
      proof.canonicalPrefixLength,
      proof.canonicalFingerprint,
      proof.token,
      proof.chatId,
      proof.routeKey,
      proof.generation,
      proof.staleRevision,
      proof.reason,
      proof.source,
    ]))}`;
  }

  function chatAtlasSelectedPathOverlayPathIdentity(path) {
    if (!Array.isArray(path)) return '';
    return `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(path.map((turn) => [
      turn?.order,
      turn?.qId,
      turn?.turnId,
      turn?.primaryAId,
      ...(Array.isArray(turn?.answerVariants) ? turn.answerVariants : []),
      turn?.noAnswer === true,
      turn?.stopped === true,
      turn?.provenance,
      turn?.confirmedByNativeEvidence === true,
    ])))}`;
  }

  function chatAtlasCanonicalPresentationIndex() {
    const index = completeTurnIndexAuthorityState.index;
    return index?.complete === true
      && index?.proof === 'host-payload-full-graph'
      && Array.isArray(index?.turns)
      && Object.isFrozen(index)
      && Object.isFrozen(index.turns)
      ? index
      : null;
  }

  function chatAtlasClearSelectedPathOverlay(reason = 'overlay-cleared', options = {}) {
    const previousPresentation = getEffectivePresentationStatus();
    selectedPathOverlayState.status = options?.invalid === true ? 'invalid' : 'inactive';
    selectedPathOverlayState.reason = chatAtlasCompleteIndexCode(reason, 'overlay-cleared', 64);
    selectedPathOverlayState.token = null;
    selectedPathOverlayState.chatId = null;
    selectedPathOverlayState.routeKey = '';
    selectedPathOverlayState.generation = 0;
    selectedPathOverlayState.staleRevision = 0;
    selectedPathOverlayState.canonicalFingerprint = '';
    selectedPathOverlayState.acquisitionProofIdentity = '';
    selectedPathOverlayState.acquisitionPathIdentity = '';
    selectedPathOverlayState.evaluationKey = '';
    selectedPathOverlayState.anchorQId = null;
    selectedPathOverlayState.activatedAt = null;
    selectedPathOverlayState.pathLength = 0;
    selectedPathOverlayState.index = null;
    selectedPathOverlayState.byQId = null;
    selectedPathOverlayState.byAId = null;
    selectedPathOverlayState.proof = null;
    return chatAtlasEmitEffectivePresentationChanged(
      previousPresentation,
      getEffectivePresentationStatus(),
      reason,
    );
  }

  function chatAtlasSelectedPathOverlayCurrent() {
    if (
      selectedPathOverlayState.status !== 'active'
      || !selectedPathOverlayState.index
      || !(selectedPathOverlayState.byQId instanceof Map)
      || !(selectedPathOverlayState.byAId instanceof Map)
      || !selectedPathOverlayState.proof
      || completeTurnIndexAuthorityState.enabled !== true
      || completeTurnIndexAuthorityState.branchSelectionStale !== true
      || selectedPathOverlayState.staleRevision
        !== Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      || selectedPathOverlayState.anchorQId
        !== String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '')
      || selectedPathOverlayState.chatId
        !== String(completeTurnIndexAuthorityState.chatId || '')
      || selectedPathOverlayState.routeKey
        !== String(completeTurnIndexAuthorityState.routeKey || '')
      || selectedPathOverlayState.generation
        !== Number(completeTurnIndexAuthorityState.generation || 0)
      || selectedPathOverlayState.canonicalFingerprint
        !== String(completeTurnIndexAuthorityState.index?.sourceFingerprint || '')
    ) return false;
    const route = chatAtlasFullIndexRoute();
    return selectedPathOverlayState.chatId === String(route?.chatId || '')
      && selectedPathOverlayState.routeKey === String(route?.routeKey || '');
  }

  function getEffectivePresentationIndex() {
    if (chatAtlasSelectedPathOverlayCurrent()) {
      return selectedPathOverlayState.index;
    }
    return chatAtlasCanonicalPresentationIndex();
  }

  function getEffectivePresentationStatus() {
    const overlayActive = chatAtlasSelectedPathOverlayCurrent();
    const canonical = chatAtlasCanonicalPresentationIndex();
    const effective = overlayActive ? selectedPathOverlayState.index : canonical;
    return chatAtlasFreeze({
      source: overlayActive ? 'selected-path-overlay' : 'canonical',
      overlayActive,
      reason: overlayActive
        ? selectedPathOverlayState.reason
        : (selectedPathOverlayState.status === 'active'
          ? 'overlay-not-current'
          : selectedPathOverlayState.reason),
      count: Array.isArray(effective?.turns) ? effective.turns.length : 0,
      chatId: String(completeTurnIndexAuthorityState.chatId || '') || null,
      routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
      canonicalFingerprint: String(canonical?.sourceFingerprint || ''),
      anchorQId: overlayActive ? selectedPathOverlayState.anchorQId : null,
      pathLength: overlayActive ? selectedPathOverlayState.pathLength : 0,
      activatedAt: overlayActive ? selectedPathOverlayState.activatedAt : null,
    });
  }

  function chatAtlasEffectivePresentationIdentity(status) {
    return JSON.stringify([
      String(status?.source || ''),
      status?.overlayActive === true,
      Math.max(0, Number(status?.count || 0) || 0),
      String(status?.canonicalFingerprint || ''),
      String(status?.anchorQId || ''),
      Math.max(0, Number(status?.pathLength || 0) || 0),
      String(status?.chatId || ''),
      String(status?.routeKey || ''),
      Math.max(0, Number(status?.generation || 0) || 0),
    ]);
  }

  function chatAtlasEmitEffectivePresentationChanged(previous, current, reason = 'presentation-updated') {
    if (
      chatAtlasEffectivePresentationIdentity(previous)
      === chatAtlasEffectivePresentationIdentity(current)
    ) return current;
    // A late-loading presentation stack will read the current effective
    // snapshot during its normal initial build. Emit only after MiniMap Core
    // has installed its presentation bridge, so no transient pre-consumer
    // publication becomes a second state channel.
    if (!W?.H2O_MM_CORE_API) return current;
    busEmit(EV_CORE_TURN_UPDATED, {
      reason: 'effective-presentation',
      cause: chatAtlasCompleteIndexCode(reason, 'presentation-updated', 64),
      version: state.version,
      qTotal: state.qTotal,
      aTotal: state.aTotal,
      turnTotal: Math.max(0, Number(current?.count || 0) || 0),
      presentationSource: String(current?.source || 'canonical'),
      presentationOverlayActive: current?.overlayActive === true,
      presentationCount: Math.max(0, Number(current?.count || 0) || 0),
      presentationAnchorQId: String(current?.anchorQId || '') || null,
      presentationPathLength: Math.max(0, Number(current?.pathLength || 0) || 0),
    });
    return current;
  }

  function getEffectiveTurnRecordByQId(qIdRaw) {
    const qId = chatAtlasCompleteIndexIdentity(qIdRaw);
    if (!qId) return null;
    if (chatAtlasSelectedPathOverlayCurrent()) {
      return selectedPathOverlayState.byQId.get(qId) || null;
    }
    const canonical = chatAtlasCanonicalPresentationIndex();
    const matches = canonical?.turns?.filter((turn) => turn.qId === qId) || [];
    return matches.length === 1 ? matches[0] : null;
  }

  function getEffectiveTurnRecordByAId(aIdRaw) {
    const aId = chatAtlasCompleteIndexIdentity(aIdRaw);
    if (!aId) return null;
    if (chatAtlasSelectedPathOverlayCurrent()) {
      return selectedPathOverlayState.byAId.get(aId) || null;
    }
    const canonical = chatAtlasCanonicalPresentationIndex();
    const matches = canonical?.turns?.filter((turn) => (
      turn.primaryAId === aId
      || (Array.isArray(turn.answerVariants) && turn.answerVariants.includes(aId))
    )) || [];
    return matches.length === 1 ? matches[0] : null;
  }

  function chatAtlasBuildSelectedPathOverlay(acquisition, canonical, ownership = {}) {
    const fail = (reason) => Object.freeze({
      ok: false,
      reason: chatAtlasCompleteIndexCode(reason, 'overlay-invalid', 64),
    });
    const proof = acquisition?.proof;
    const path = acquisition?.path;
    const intent = ownership?.intent;
    const expectedProofKeys = [
      'anchorQId',
      'anchorSelectedAId',
      'rootNodeId',
      'tailNodeId',
      'pathLength',
      'canonicalPrefixLength',
      'canonicalFingerprint',
      'graphCapturedAt',
      'token',
      'chatId',
      'routeKey',
      'generation',
      'staleRevision',
      'reason',
      'source',
    ];
    // The default origin carries the same proof shape plus the facts that
    // stand in for a user capture. Both lists stay EXACT: an unrecognised key
    // is still an invalid proof.
    const expectedDefaultProofKeys = [
      ...expectedProofKeys,
      'defaultOrigin',
      'defaultTerminalNodeId',
      'defaultTerminalCreateTime',
      'defaultPathFingerprint',
      'graphCaptureIdentity',
      'manualOverrideRevision',
      'defaultDivergenceKind',
      'defaultAnswerOnlyProven',
      'defaultResolutionSource',
    ];
    const expectedPathKeys = [
      'order',
      'qId',
      'turnId',
      'primaryAId',
      'answerVariants',
      'noAnswer',
      'stopped',
      'provenance',
      'confirmedByNativeEvidence',
    ];
    if (ownership?.enabled !== true) return fail('feature-disabled');
    if (acquisition?.status !== 'proven') return fail('acquisition-not-proven');
    if (
      !canonical
      || canonical.complete !== true
      || canonical.proof !== 'host-payload-full-graph'
      || !Array.isArray(canonical.turns)
      || !canonical.turns.length
      || !Object.isFrozen(canonical)
      || !Object.isFrozen(canonical.turns)
      || canonical.turns.some((turn) => (
        !Object.isFrozen(turn)
        || !Object.isFrozen(turn?.answerVariants)
      ))
    ) return fail('canonical-authority-unavailable');
    if (
      !proof
      || !Object.isFrozen(proof)
      || !(
        chatAtlasCompleteIndexExactKeys(proof, expectedProofKeys)
        || (
          proof.defaultOrigin === true
          && chatAtlasCompleteIndexExactKeys(proof, expectedDefaultProofKeys)
        )
      )
      || proof.reason !== 'selected-path-proven'
      || proof.source !== 'host-identity-graph'
      || !chatAtlasCompleteIndexIdentity(proof.rootNodeId)
      || !chatAtlasCompleteIndexIdentity(proof.tailNodeId)
      || !String(proof.graphCapturedAt || '')
      || !String(proof.token || '')
    ) return fail('acquisition-proof-invalid');
    if (
      !Array.isArray(path)
      || !Object.isFrozen(path)
      || path.length < 1
      || path.length > 512
      || path.some((turn) => (
        !turn
        || !Object.isFrozen(turn)
        || !Object.isFrozen(turn.answerVariants)
        || !chatAtlasCompleteIndexExactKeys(turn, expectedPathKeys)
      ))
    ) return fail(path?.length > 512 ? 'path-bounds-exceeded' : 'path-invalid');
    if (Number(proof.pathLength || 0) !== path.length) {
      return fail('proof-path-length-mismatch');
    }
    if (
      String(acquisition?.token || '') !== String(proof.token || '')
      || String(acquisition?.anchorQId || '') !== String(proof.anchorQId || '')
      || String(acquisition?.anchorSelectedAId || '') !== String(proof.anchorSelectedAId || '')
      || String(acquisition?.chatId || '') !== String(proof.chatId || '')
      || String(acquisition?.routeKey || '') !== String(proof.routeKey || '')
      || Number(acquisition?.generation || 0) !== Number(proof.generation || 0)
      || Number(acquisition?.staleRevision || 0) !== Number(proof.staleRevision || 0)
    ) return fail('acquisition-ownership-mismatch');
    // Two admission paths, branched explicitly by origin. The manual path is
    // unchanged: a trusted user capture, its token, and the stale checkpoint
    // it opened. The default path never fabricates any of that — it proves a
    // different, equally exact set of facts about the graph it came from.
    const origin = String(ownership.origin || 'manual-native-selection');
    if (origin !== 'manual-native-selection' && origin !== 'default-latest-created') {
      return fail('overlay-origin-unknown');
    }
    if (
      String(ownership.chatId || '') !== String(ownership.routeChatId || '')
      || String(ownership.routeKey || '') !== String(ownership.routeRouteKey || '')
    ) return fail('route-mismatch');
    if (
      String(proof.chatId || '') !== String(ownership.chatId || '')
      || chatAtlasCompleteIndexIdentity(canonical.chatId) !== String(ownership.chatId || '')
    ) return fail('chat-mismatch');
    if (String(proof.routeKey || '') !== String(ownership.routeKey || '')) return fail('route-mismatch');
    if (Number(proof.generation || 0) !== Number(ownership.generation || 0)) {
      return fail('generation-mismatch');
    }
    if (origin === 'manual-native-selection') {
      if (!intent || String(intent.token || '') !== String(proof.token || '')) {
        return fail(intent ? 'token-mismatch' : 'trusted-intent-missing');
      }
      if (String(intent.chatId || '') !== String(ownership.chatId || '')) return fail('chat-mismatch');
      if (String(intent.routeKey || '') !== String(ownership.routeKey || '')) return fail('route-mismatch');
      if (Number(intent.generation || 0) !== Number(ownership.generation || 0)) {
        return fail('generation-mismatch');
      }
      if (ownership.stale !== true) return fail('stale-inactive');
      if (
        String(proof.anchorQId || '') !== String(ownership.staleQId || '')
        || String(intent.qId || '') !== String(ownership.staleQId || '')
      ) return fail('stale-qid-mismatch');
      if (
        Number(proof.staleRevision || 0) !== Number(ownership.staleRevision || 0)
        || Number(intent.staleRevision || 0) !== Number(ownership.staleRevision || 0)
      ) return fail('stale-revision-mismatch');
    } else {
      // default-latest-created. No user acted, so there is nothing to own the
      // publication except the graph itself: the exact capture it came from,
      // a unique newest terminal with a trustworthy creation time, and the
      // absence of any manual selection in this page session.
      if (proof.defaultOrigin !== true) return fail('default-origin-unproven');
      if (!chatAtlasCompleteIndexIdentity(proof.defaultTerminalNodeId)) {
        return fail('default-terminal-unproven');
      }
      const created = Number(proof.defaultTerminalCreateTime || 0);
      if (!Number.isFinite(created) || created <= 0) return fail('default-terminal-create-time-invalid');
      if (!String(proof.defaultPathFingerprint || '')) return fail('default-fingerprint-missing');
      if (!String(proof.graphCaptureIdentity || '')) return fail('default-graph-capture-unproven');
      if (
        String(proof.graphCaptureIdentity || '')
        !== String(selectedPathAcquisitionState.graph?.captureIdentity || '')
      ) return fail('default-graph-capture-drift');
      if (ownership.manualOverrideActive === true) return fail('default-superseded-by-manual');
      if (Number(ownership.manualOverrideRevision || 0) !== Number(proof.manualOverrideRevision || 0)) {
        return fail('default-superseded-by-manual');
      }
    }
    if (
      String(proof.canonicalFingerprint || '') !== String(canonical.sourceFingerprint || '')
      || String(canonical.sourceFingerprint || '') !== chatAtlasCompleteIndexFingerprint(canonical.turns)
    ) return fail('canonical-fingerprint-mismatch');

    const canonicalPrefixLength = Number(proof.canonicalPrefixLength || 0);
    if (
      !Number.isInteger(canonicalPrefixLength)
      || canonicalPrefixLength < 1
      || canonicalPrefixLength > path.length
      || canonicalPrefixLength > canonical.turns.length
    ) return fail('anchor-qid-mismatch');
    const anchorIndex = canonicalPrefixLength - 1;
    const proofAnchorQId = chatAtlasCompleteIndexIdentity(proof.anchorQId);
    const proofAnchorAId = chatAtlasCompleteIndexIdentity(proof.anchorSelectedAId);
    if (!proofAnchorQId || !proofAnchorAId) return fail('anchor-answer-mismatch');

    const answerOwners = new Map();
    const byQId = new Map();
    const byAId = new Map();
    const turnIds = new Set();
    const rows = [];
    let answerLookupCount = 0;
    for (let index = 0; index < path.length; index += 1) {
      const sourceRow = path[index];
      const order = Number(sourceRow.order || 0);
      const qId = chatAtlasCompleteIndexIdentity(sourceRow.qId);
      const turnId = String(sourceRow.turnId || '');
      if (order !== index + 1) return fail('order-noncontiguous');
      if (!qId || COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS.includes(qId)) {
        return fail('question-identity-invalid');
      }
      if (byQId.has(qId)) return fail('duplicate-qid');
      if (turnId !== `turn:${qId}`) return fail('turn-identity-invalid');
      if (turnIds.has(turnId)) return fail('duplicate-turn-id');
      if (!Array.isArray(sourceRow.answerVariants)) return fail('answer-variants-invalid');
      const variants = [];
      for (const rawAnswerId of sourceRow.answerVariants) {
        const answerId = chatAtlasCompleteIndexIdentity(rawAnswerId);
        if (!answerId || variants.includes(answerId)) return fail('answer-variants-invalid');
        const owner = answerOwners.get(answerId);
        if (owner && owner !== qId) return fail('answer-identity-ambiguous');
        answerOwners.set(answerId, qId);
        variants.push(answerId);
        answerLookupCount += 1;
        if (answerLookupCount > 8192) return fail('path-bounds-exceeded');
      }
      const primaryAId = sourceRow.primaryAId == null
        ? null
        : chatAtlasCompleteIndexIdentity(sourceRow.primaryAId);
      if (
        typeof sourceRow.noAnswer !== 'boolean'
        || typeof sourceRow.stopped !== 'boolean'
      ) return fail('answer-state-invalid');
      if (sourceRow.noAnswer) {
        if (sourceRow.primaryAId != null || primaryAId || variants.length) {
          return fail('answer-state-invalid');
        }
        // A no-answer turn may sit MID-path: the live 39-turn branch carries
        // an unanswered question whose conversation genuinely continues (the
        // "TITLE 20 NO ANSWER" turn). Requiring it to be terminal rejected
        // the complete derived branch and froze authority on the outgoing
        // one. Its answer-state shape (no primary, no variants) is fully
        // validated above; position carries no additional integrity.
      } else if (
        !primaryAId
        || !variants.length
        || variants[variants.length - 1] !== primaryAId
      ) return fail('answer-state-invalid');
      const row = chatAtlasFreeze({
        order,
        qId,
        turnId,
        primaryAId,
        answerVariants: variants,
        noAnswer: sourceRow.noAnswer,
        stopped: sourceRow.stopped,
      });
      rows.push(row);
      byQId.set(qId, row);
      turnIds.add(turnId);
      for (const answerId of variants) byAId.set(answerId, row);
    }

    const sameCanonicalRow = (left, right) => (
      left.order === right.order
      && left.qId === right.qId
      && left.turnId === right.turnId
      && left.primaryAId === right.primaryAId
      && left.noAnswer === right.noAnswer
      && left.stopped === right.stopped
      && JSON.stringify(left.answerVariants) === JSON.stringify(right.answerVariants)
    );
    for (let index = 0; index < anchorIndex; index += 1) {
      if (
        path[index].provenance !== 'canonical-prefix'
        || !sameCanonicalRow(rows[index], canonical.turns[index])
      ) return fail('canonical-prefix-mismatch');
    }
    const anchorSource = path[anchorIndex];
    const anchorRow = rows[anchorIndex];
    const canonicalAnchor = canonical.turns[anchorIndex];
    if (
      anchorSource.provenance !== 'anchor'
      || anchorSource.confirmedByNativeEvidence !== true
      || anchorRow.qId !== proofAnchorQId
      || canonicalAnchor?.qId !== proofAnchorQId
    ) return fail('anchor-qid-mismatch');
    if (anchorRow.primaryAId !== proofAnchorAId) return fail('anchor-answer-mismatch');
    if (!canonicalAnchor.answerVariants.includes(proofAnchorAId)) {
      return fail('anchor-answer-not-variant');
    }
    // Divergence proof, by origin. A manual selection switches the ANSWER at
    // the anchor turn itself. A default path shares the anchor turn exactly and
    // diverges strictly BELOW it — by a different question variant, a different
    // answer variant, or a different length. Both must genuinely differ from
    // the canonical path; neither may publish a copy of it.
    if (origin === 'manual-native-selection') {
      if (canonicalAnchor.primaryAId === proofAnchorAId) return fail('anchor-does-not-diverge');
    } else {
      // An ANSWER divergence is anchored ON the turn whose answer differs:
      // same question, different selected answer — the same shape a manual
      // regeneration switch has. A QUESTION divergence is anchored on the last
      // shared turn and must diverge strictly BELOW it.
      if (proof.defaultDivergenceKind === 'assistant-regeneration') {
        if (canonicalAnchor.primaryAId === proofAnchorAId) return fail('anchor-does-not-diverge');
      } else if (proof.defaultDivergenceKind === 'question-edit') {
        if (canonicalAnchor.primaryAId !== proofAnchorAId) return fail('default-anchor-not-shared');
        const nextPath = path[anchorIndex + 1] || null;
        const nextCanonical = canonical.turns[anchorIndex + 1] || null;
        const divergesBelow = !nextPath
          ? !!nextCanonical
          : (
            !nextCanonical
            || chatAtlasCompleteIndexIdentity(nextPath.qId) !== chatAtlasCompleteIndexIdentity(nextCanonical.qId)
            || chatAtlasCompleteIndexIdentity(nextPath.primaryAId) !== chatAtlasCompleteIndexIdentity(nextCanonical.primaryAId)
          );
        if (!divergesBelow) return fail('anchor-does-not-diverge');
      } else {
        return fail('default-divergence-kind-unproven');
      }
    }
    const canonicalQIds = new Set(canonical.turns.map((turn) => turn.qId));
    for (let index = anchorIndex + 1; index < path.length; index += 1) {
      if (path[index].provenance !== 'graph-descent') return fail('path-invalid');
      // A reused canonical question below the anchor is a foreign append —
      // EXCEPT for a default route that differs from the host by answer
      // selection only. That path adds, removes and reorders nothing: every
      // row keeps its order and question, and only graph-proven answer
      // variants differ. The exception is unavailable to every other origin
      // and to every other divergence kind.
      const answerOnlyReuse = origin === 'default-latest-created'
        && proof.defaultDivergenceKind === 'assistant-regeneration'
        && proof.defaultAnswerOnlyProven === true
        && !!canonical.turns[index]
        && chatAtlasCompleteIndexIdentity(canonical.turns[index].qId) === rows[index].qId
        && Number(canonical.turns[index].order || 0) === Number(rows[index].order || 0);
      if (canonicalQIds.has(rows[index].qId) && !answerOnlyReuse) return fail('duplicate-qid');
    }

    const activatedAt = String(ownership.activatedAt || '').slice(0, 64);
    if (!activatedAt) return fail('acquisition-proof-invalid');
    const acquisitionProofIdentity = chatAtlasSelectedPathOverlayProofIdentity(proof);
    const acquisitionPathIdentity = chatAtlasSelectedPathOverlayPathIdentity(path);
    if (!acquisitionProofIdentity || !acquisitionPathIdentity) {
      return fail('acquisition-proof-invalid');
    }
    const frozenRows = chatAtlasFreeze(rows);
    const sourceFingerprint = chatAtlasCompleteIndexFingerprint(frozenRows);
    const index = chatAtlasFreeze({
      schema: COMPLETE_TURN_INDEX_CACHE_SCHEMA,
      chatId: canonical.chatId,
      payloadUpdateTime: canonical.payloadUpdateTime,
      sourceFingerprint,
      capturedAt: activatedAt,
      validatedAt: activatedAt,
      complete: true,
      proof: 'selected-path-overlay',
      turns: frozenRows,
    });
    const overlayProof = chatAtlasFreeze({
      source: 'selected-path-acquisition',
      reason: 'selected-path-overlay-proven',
      anchorQId: proofAnchorQId,
      anchorSelectedAId: proofAnchorAId,
      rootNodeId: proof.rootNodeId,
      tailNodeId: proof.tailNodeId,
      pathLength: rows.length,
      canonicalPrefixLength,
      canonicalFingerprint: canonical.sourceFingerprint,
      overlayFingerprint: sourceFingerprint,
      acquisitionProofIdentity,
      acquisitionPathIdentity,
      token: proof.token,
      chatId: ownership.chatId,
      routeKey: ownership.routeKey,
      generation: ownership.generation,
      staleRevision: ownership.staleRevision,
      activatedAt,
    });
    return Object.freeze({
      ok: true,
      reason: 'selected-path-overlay-proven',
      token: proof.token,
      chatId: ownership.chatId,
      routeKey: ownership.routeKey,
      generation: ownership.generation,
      staleRevision: ownership.staleRevision,
      canonicalFingerprint: canonical.sourceFingerprint,
      acquisitionProofIdentity,
      acquisitionPathIdentity,
      evaluationKey: JSON.stringify([
        proof.token,
        acquisitionProofIdentity,
        acquisitionPathIdentity,
        canonical.sourceFingerprint,
      ]),
      anchorQId: proofAnchorQId,
      activatedAt,
      pathLength: rows.length,
      index,
      byQId,
      byAId,
      proof: overlayProof,
    });
  }

  function chatAtlasSelectedPathOverlayCandidateValid(candidate) {
    return candidate?.ok === true
      && candidate?.index?.complete === true
      && candidate?.index?.proof === 'selected-path-overlay'
      && Array.isArray(candidate?.index?.turns)
      && candidate.index.turns.length === Number(candidate.pathLength || 0)
      && candidate.byQId instanceof Map
      && candidate.byAId instanceof Map
      && candidate.byQId.size === candidate.index.turns.length
      && Object.isFrozen(candidate.index)
      && Object.isFrozen(candidate.index.turns)
      && Object.isFrozen(candidate.proof);
  }

  function chatAtlasTurnStateMatchesEffectiveIndex(index) {
    const turns = Array.isArray(index?.turns) ? index.turns : [];
    const records = Array.isArray(turnState.turns) ? turnState.turns : [];
    if (!turns.length || records.length !== turns.length) return false;
    return turns.every((turn, indexValue) => {
      const record = records[indexValue];
      const answerIds = Array.isArray(record?.answerIds) ? record.answerIds : [];
      return Number(record?.turnNo || 0) === indexValue + 1
        && chatAtlasCompleteIndexIdentity(record?.qId) === turn.qId
        && (chatAtlasCompleteIndexIdentity(record?.primaryAId) || null) === turn.primaryAId
        && record?.noAnswer === turn.noAnswer
        && JSON.stringify(answerIds) === JSON.stringify(turn.answerVariants);
    });
  }

  function chatAtlasInstallSelectedPathOverlay(candidate) {
    if (!chatAtlasSelectedPathOverlayCandidateValid(candidate)) {
      return chatAtlasClearSelectedPathOverlay(
        candidate?.reason || 'overlay-candidate-invalid',
        { invalid: true },
      );
    }
    const previousPresentation = getEffectivePresentationStatus();
    selectedPathOverlayState.reason = 'selected-path-overlay-active';
    selectedPathOverlayState.token = candidate.token;
    selectedPathOverlayState.chatId = candidate.chatId;
    selectedPathOverlayState.routeKey = candidate.routeKey;
    selectedPathOverlayState.generation = candidate.generation;
    selectedPathOverlayState.staleRevision = candidate.staleRevision;
    selectedPathOverlayState.canonicalFingerprint = candidate.canonicalFingerprint;
    selectedPathOverlayState.acquisitionProofIdentity = candidate.acquisitionProofIdentity;
    selectedPathOverlayState.acquisitionPathIdentity = candidate.acquisitionPathIdentity;
    selectedPathOverlayState.evaluationKey = candidate.evaluationKey;
    selectedPathOverlayState.anchorQId = candidate.anchorQId;
    selectedPathOverlayState.activatedAt = candidate.activatedAt;
    selectedPathOverlayState.pathLength = candidate.pathLength;
    selectedPathOverlayState.index = candidate.index;
    selectedPathOverlayState.byQId = candidate.byQId;
    selectedPathOverlayState.byAId = candidate.byAId;
    selectedPathOverlayState.proof = candidate.proof;
    // Publish membership as one transaction: make the frozen index current,
    // rebuild Core from that exact index, validate every row identity, and
    // only then release the keyed branch transaction. No graph prefix or
    // mounted-shell prefix is observable as a completed branch.
    selectedPathOverlayState.status = 'active';
    // The published branch is authority; the host may still display a
    // different downstream edit. Confirm a prior activation, else attempt one
    // bounded, fully identity-proven convergence step.
    // Confirm any landed step first, then attempt the NEXT branch point: the
    // path may nest several (a question edit, then a regeneration below it),
    // and each publication advances at most one bounded, proven step.
    try {
      chatAtlasConfirmNativeConvergence('overlay-active');
      chatAtlasRunNativeConvergence('overlay-active');
    } catch {}
    try {
      buildTurns();
    } catch {
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        'selected-path-core-rebuild-failed',
        String(candidate.token || ''),
      );
      const cleared = chatAtlasClearSelectedPathOverlay(
        'selected-path-core-rebuild-failed',
        { invalid: true },
      );
      try { buildTurns(); } catch {}
      return cleared;
    }
    if (!chatAtlasTurnStateMatchesEffectiveIndex(candidate.index)) {
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        'selected-path-core-parity-failed',
        String(candidate.token || ''),
      );
      const cleared = chatAtlasClearSelectedPathOverlay(
        'selected-path-core-parity-failed',
        { invalid: true },
      );
      try { buildTurns(); } catch {}
      return cleared;
    }
    chatAtlasCloseBranchTransaction(
      'published',
      'selected-path-overlay-active',
      String(candidate.token || ''),
    );

    // The presentation event is the existing downstream reconciliation
    // checkpoint. Retire the exact request owner before emitting it so Page
    // units observe the accepted immutable branch, not the just-completed
    // acquisition lease, on their only publication pass.
    completeIndexRefreshCoordinator?.settleSelectedPathGraphPublication?.(
      String(candidate.token || ''),
    );
    return chatAtlasEmitEffectivePresentationChanged(
      previousPresentation,
      getEffectivePresentationStatus(),
      'selected-path-overlay-active',
    );
  }

  function chatAtlasSelectedPathOverlayEvaluate() {
    const acquisition = selectedPathAcquisitionState;
    const canonical = chatAtlasCanonicalPresentationIndex();
    const proofIdentity = chatAtlasSelectedPathOverlayProofIdentity(acquisition?.proof);
    const pathIdentity = chatAtlasSelectedPathOverlayPathIdentity(acquisition?.path);
    const prospectiveKey = acquisition?.proof
      ? JSON.stringify([
        acquisition.proof.token,
        proofIdentity,
        pathIdentity,
        canonical?.sourceFingerprint || '',
      ])
      : '';
    if (
      chatAtlasSelectedPathOverlayCurrent()
      && prospectiveKey
      && selectedPathOverlayState.evaluationKey === prospectiveKey
    ) return getEffectivePresentationStatus();
    if (acquisition?.status !== 'proven') {
      const retainAfterProofReasons = new Set([
        'anchor-member-missing',
        'trusted-intent-expired',
        'trusted-intent-unavailable',
        'trusted-intent-resolved-unconfirmed',
        'trusted-intent-resolved-failed',
        'trusted-intent-resolved-cancelled',
        'reconciliation-disabled-by-setter',
      ]);
      if (
        retainAfterProofReasons.has(String(acquisition?.reason || ''))
        && chatAtlasSelectedPathOverlayCurrent()
      ) return getEffectivePresentationStatus();
      if (selectedPathOverlayState.status === 'active') {
        return chatAtlasClearSelectedPathOverlay('acquisition-not-proven');
      }
      return getEffectivePresentationStatus();
    }
    const intent = chatAtlasCurrentTrustedNativeBranchSelection(acquisition.anchorQId);
    const route = chatAtlasFullIndexRoute();
    const candidate = chatAtlasBuildSelectedPathOverlay(acquisition, canonical, {
      intent,
      enabled: completeTurnIndexAuthorityState.enabled === true,
      chatId: String(completeTurnIndexAuthorityState.chatId || ''),
      routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
      stale: completeTurnIndexAuthorityState.branchSelectionStale === true,
      staleQId: String(completeTurnIndexAuthorityState.branchSelectionStaleQId || ''),
      staleRevision: Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0),
      routeChatId: String(route?.chatId || ''),
      routeRouteKey: String(route?.routeKey || ''),
      origin: String(acquisition?.origin || 'manual-native-selection'),
      manualOverrideActive: completeTurnIndexAuthorityState.manualOverrideActive === true,
      manualOverrideRevision: Number(completeTurnIndexAuthorityState.manualOverrideRevision || 0),
      activatedAt: new Date().toISOString(),
    });
    if (!candidate.ok) {
      return chatAtlasClearSelectedPathOverlay(candidate.reason, { invalid: true });
    }
    if (
      candidate.chatId !== String(route?.chatId || '')
      || candidate.routeKey !== String(route?.routeKey || '')
    ) {
      return chatAtlasClearSelectedPathOverlay('route-mismatch', { invalid: true });
    }
    return chatAtlasInstallSelectedPathOverlay(candidate);
  }

  function chatAtlasIdentityGraphValid(graph, chatIdRaw) {
    const chatId = chatAtlasCompleteIndexIdentity(chatIdRaw);
    if (
      !graph
      || typeof graph !== 'object'
      || Array.isArray(graph)
      || chatAtlasCompleteIndexIdentity(graph.chatId) !== chatId
      || !chatAtlasCompleteIndexIdentity(graph.currentNode)
      || !Array.isArray(graph.nodes)
      || !Number.isInteger(graph.nodeCount)
      || graph.nodeCount !== graph.nodes.length
      || graph.nodeCount < 1
      || graph.nodeCount > 8192
      || !String(graph.capturedAt || '')
    ) return false;
    const nodeIds = new Set();
    for (const node of graph.nodes) {
      if (
        !node
        || typeof node !== 'object'
        || Array.isArray(node)
        || !(
          chatAtlasCompleteIndexExactKeys(node, [
            'nodeId',
            'parentId',
            'childIds',
            'role',
            'messageId',
            'productUser',
            'productAnswer',
            'stopped',
          ])
          || chatAtlasCompleteIndexExactKeys(node, [
            'nodeId',
            'parentId',
            'childIds',
            'role',
            'messageId',
            'productUser',
            'productAnswer',
            'branchShellAlias',
            'stopped',
          ])
          // Stage 2C-2r: the host's message creation time travels with the
          // node so branches can be ordered by when they were created. The
          // key set stays EXACT — an unknown key is still a rejected graph.
          || chatAtlasCompleteIndexExactKeys(node, [
            'nodeId',
            'parentId',
            'childIds',
            'role',
            'messageId',
            'productUser',
            'productAnswer',
            'stopped',
            'createTime',
          ])
          || chatAtlasCompleteIndexExactKeys(node, [
            'nodeId',
            'parentId',
            'childIds',
            'role',
            'messageId',
            'productUser',
            'productAnswer',
            'branchShellAlias',
            'stopped',
            'createTime',
          ])
        )
      ) return false;
      const nodeId = chatAtlasCompleteIndexIdentity(node.nodeId);
      const messageId = chatAtlasCompleteIndexIdentity(node.messageId);
      if (
        !nodeId
        || nodeIds.has(nodeId)
        || !messageId
        || (
          Object.hasOwn(node, 'createTime')
          && node.createTime !== null
          && !(typeof node.createTime === 'number' && Number.isFinite(node.createTime) && node.createTime > 0)
        )
        || (node.parentId != null && !chatAtlasCompleteIndexIdentity(node.parentId))
        || !Array.isArray(node.childIds)
        || node.childIds.some((childId) => !chatAtlasCompleteIndexIdentity(childId))
        || new Set(node.childIds).size !== node.childIds.length
        || typeof node.productUser !== 'boolean'
        || typeof node.productAnswer !== 'boolean'
        || (Object.hasOwn(node, 'branchShellAlias') && typeof node.branchShellAlias !== 'boolean')
        || typeof node.stopped !== 'boolean'
      ) return false;
      nodeIds.add(nodeId);
    }
    if (!nodeIds.has(graph.currentNode)) return false;
    const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    for (const node of graph.nodes) {
      if (node.parentId && !nodeIds.has(node.parentId)) return false;
      if (node.childIds.some((childId) => !nodeIds.has(childId))) return false;
      if (
        node.parentId
        && !nodeById.get(node.parentId)?.childIds?.includes(node.nodeId)
      ) return false;
      if (node.childIds.some((childId) => nodeById.get(childId)?.parentId !== node.nodeId)) {
        return false;
      }
    }
    return true;
  }

  function chatAtlasRetainIdentityGraph(result, context = {}) {
    const chatId = chatAtlasCompleteIndexIdentity(context?.chatId);
    const routeKey = String(context?.routeKey || '');
    const generation = Number(context?.generation || 0);
    const graph = result?.ok === true ? result?.identityGraph : null;
    if (
      !chatId
      || !routeKey
      || !Number.isInteger(generation)
      || generation < 1
      || !chatAtlasIdentityGraphValid(graph, chatId)
    ) return false;
    const captureIdentity = `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
      graph.currentNode,
      ...graph.nodes.map((node) => [
        node.nodeId,
        node.parentId,
        ...node.childIds,
        node.role,
        node.messageId,
        node.productUser,
        node.productAnswer,
        node.branchShellAlias === true,
        node.stopped,
      ]),
    ]))}`;
    const priorGraph = selectedPathAcquisitionState.graph;
    const graphUnchanged = priorGraph?.captureIdentity === captureIdentity;
    selectedPathAcquisitionState.graph = Object.freeze({
      identityGraph: graph,
      chatId,
      routeKey,
      generation,
      captureIdentity,
    });
    if (
      selectedPathAcquisitionState.status === 'proven'
      && graphUnchanged
      && selectedPathAcquisitionState.proof
    ) {
      selectedPathAcquisitionState.proof = chatAtlasFreeze({
        ...selectedPathAcquisitionState.proof,
        graphCapturedAt: String(graph.capturedAt || ''),
      });
    } else if (
      selectedPathAcquisitionState.status === 'proven'
      // An ordinary post-publication re-capture replaces the graph object
      // without invalidating the published path. Only a genuine scope change
      // (chat/route/generation) may retire a published selection here, and
      // that arrives through the reset boundary instead.
      && !chatAtlasAcquisitionPublicationOwned()
    ) {
      selectedPathAcquisitionState.status = 'inactive';
      selectedPathAcquisitionState.reason = 'graph-replaced';
      selectedPathAcquisitionState.path = null;
      selectedPathAcquisitionState.proof = null;
      selectedPathAcquisitionState.provenAt = null;
      selectedPathAcquisitionState.evaluationKey = '';
    }
    return true;
  }

  function chatAtlasNormalizeGraphDiagnosticIds(ids = []) {
    const normalized = [];
    const seen = new Set();
    for (const rawId of Array.isArray(ids) ? ids : []) {
      if (typeof rawId !== 'string') continue;
      const withoutTurnPrefix = rawId.trim().replace(/^turn:/i, '').trim();
      const identity = chatAtlasCompleteIndexIdentity(withoutTurnPrefix);
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      normalized.push(identity);
      if (normalized.length >= 32) break;
    }
    return normalized;
  }

  function chatAtlasGraphIdentitySummary(node = null) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
    return {
      nodeId: chatAtlasCompleteIndexIdentity(node.nodeId) || null,
      messageId: chatAtlasCompleteIndexIdentity(node.messageId) || null,
      role: String(node.role || '') || null,
      productUser: node.productUser === true,
      productAnswer: node.productAnswer === true,
      stopped: node.stopped === true,
    };
  }

  function chatAtlasGraphIdentityMiss(requestedId) {
    return {
      requestedId,
      found: false,
      matchedDomains: [],
      nodeId: null,
      messageId: null,
      role: null,
      parent: null,
      children: [],
      productUser: false,
      productAnswer: false,
      stopped: false,
      isCurrentNode: false,
    };
  }

  function getGraphIdentityDiagnostics(ids = []) {
    const requestedIds = chatAtlasNormalizeGraphDiagnosticIds(ids);
    const unavailable = (reason, scope = null) => chatAtlasFreeze({
      version: 1,
      available: false,
      reason,
      scope,
      records: requestedIds.map((requestedId) => chatAtlasGraphIdentityMiss(requestedId)),
    });
    const retained = selectedPathAcquisitionState.graph;
    const graph = retained?.identityGraph || null;
    if (!graph) return unavailable('graph-unavailable');

    const authority = completeTurnIndexAuthorityState;
    const route = chatAtlasFullIndexRoute();
    if (
      authority.enabled !== true
      || !chatAtlasCompleteIndexAuthorityActive()
      || !authority.index
      || !route?.chatId
      || !route?.routeKey
    ) return unavailable('authority-unavailable');

    const scope = chatAtlasFreeze({
      chatId: String(retained.chatId || '') || null,
      routeKey: String(retained.routeKey || ''),
      generation: Math.max(0, Number(retained.generation || 0)),
      fingerprint: String(retained.captureIdentity || '') || null,
      graphCurrentNodeId: chatAtlasCompleteIndexIdentity(graph.currentNode) || null,
      graphNodeCount: Number.isInteger(graph.nodeCount) ? graph.nodeCount : 0,
    });
    const scopeCurrent = (
      chatAtlasCompleteIndexIdentity(retained.chatId) === chatAtlasCompleteIndexIdentity(route.chatId)
      && String(retained.routeKey || '') === String(route.routeKey || '')
      && Number(retained.generation || 0) === Number(authority.generation || 0)
      && chatAtlasCompleteIndexIdentity(authority.chatId) === chatAtlasCompleteIndexIdentity(route.chatId)
      && String(authority.routeKey || '') === String(route.routeKey || '')
      && !!scope.fingerprint
      && chatAtlasIdentityGraphValid(graph, route.chatId)
    );
    if (!scopeCurrent) return unavailable('graph-stale', scope);

    const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    const records = requestedIds.map((requestedId) => {
      const matches = graph.nodes.filter((node) => (
        node.nodeId === requestedId || node.messageId === requestedId
      ));
      if (matches.length !== 1) return chatAtlasGraphIdentityMiss(requestedId);
      const node = matches[0];
      const matchedDomains = [];
      if (node.nodeId === requestedId) matchedDomains.push('nodeId');
      if (node.messageId === requestedId) matchedDomains.push('messageId');
      const parent = node.parentId ? chatAtlasGraphIdentitySummary(nodeById.get(node.parentId)) : null;
      const children = node.childIds
        .slice(0, 32)
        .map((childId) => chatAtlasGraphIdentitySummary(nodeById.get(childId)))
        .filter(Boolean);
      return {
        requestedId,
        found: true,
        matchedDomains,
        nodeId: chatAtlasCompleteIndexIdentity(node.nodeId) || null,
        messageId: chatAtlasCompleteIndexIdentity(node.messageId) || null,
        role: String(node.role || '') || null,
        parent,
        children,
        productUser: node.productUser === true,
        productAnswer: node.productAnswer === true,
        stopped: node.stopped === true,
        isCurrentNode: node.nodeId === graph.currentNode,
      };
    });
    return chatAtlasFreeze({
      version: 1,
      available: true,
      reason: null,
      scope,
      records,
    });
  }

  function chatAtlasSelectedPathNativeEvidence(members = []) {
    const byQId = new Map();
    for (const member of Array.isArray(members) ? members : []) {
      const qId = chatAtlasCompleteIndexIdentity(member?.question?.currentQId);
      if (!qId || member?.answer?.currentProjectionSource !== 'native-evidence') continue;
      const answerIds = chatAtlasCv2CurrentIds(member?.answer?.currentAnswerIds || [])
        .map(chatAtlasCompleteIndexIdentity)
        .filter(Boolean);
      const prior = byQId.get(qId);
      if (prior) {
        prior.memberCount += 1;
        for (const answerId of answerIds) prior.answerIds.add(answerId);
      } else {
        byQId.set(qId, { memberCount: 1, answerIds: new Set(answerIds) });
      }
    }
    return byQId;
  }

  // ---- Native client selected-chain authority ------------------------------
  // The host backend's current_node is proven NOT to follow a native variant
  // switch: a successful 30s no-store refetch returned the pre-click node while
  // the page was visibly on the new answer. ChatGPT itself renders the thread
  // from a client-side linearized chain of selected message ids, which does
  // follow the switch immediately and covers unmounted turns. That chain is the
  // manual-session authority; the graph remains the validator, never the guess.
  const CHAT_ATLAS_CLIENT_CHAIN_MAX_FIBER_HOPS = 80;
  const CHAT_ATLAS_CLIENT_CHAIN_MAX_SCAN_NODES = 24000;
  const CHAT_ATLAS_CLIENT_CHAIN_MAX_DEPTH = 9;
  const CHAT_ATLAS_CLIENT_CHAIN_MIN_LENGTH = 2;

  // Structural discovery only. Minified component names, hop counts and hook
  // indices all rotate on any host deploy, so none of them may be relied on:
  // every ancestor fiber's props and full hook chain are scanned generically,
  // and a candidate is kept only if every string it holds is a message id this
  // graph already knows.
  // `isKnownChainId` decides whether ONE raw string may belong to a candidate.
  // It is deliberately wider than "product message": the host's own selected
  // chain is a root-to-leaf walk and legitimately carries structural graph node
  // ids at its endpoints (live shape: `client-created-root` at index 0 and a
  // structural terminal at index 38 of a 39-entry chain whose other 37 entries
  // are product messages). Requiring every entry to be a product message threw
  // that entire chain away on its FIRST element. The all-or-nothing rule below
  // is unchanged and still fail-closed — what widened is only what counts as
  // provably owned by this identity graph.
  function chatAtlasClientChainCollectCandidates(isKnownChainId) {
    const found = [];
    const D = typeof document === 'undefined' ? null : document;
    if (!D || typeof D.querySelectorAll !== 'function') return found;
    const anchors = [];
    try {
      const thread = D.querySelector('[data-conversation-screenshot-content]');
      if (thread) anchors.push(thread);
      const mounted = D.querySelectorAll('[data-message-id]');
      for (let index = 0; index < mounted.length && anchors.length < 6; index += 1) {
        anchors.push(mounted[index]);
      }
    } catch { return found; }
    const signatures = new Set();
    let budget = CHAT_ATLAS_CLIENT_CHAIN_MAX_SCAN_NODES;
    const consider = (value) => {
      const ids = [];
      for (const entry of value) {
        if (typeof entry !== 'string') continue;
        const id = chatAtlasCompleteIndexIdentity(entry);
        // An id this graph does not uniquely own disqualifies the whole array;
        // partial matches are never silently trimmed.
        if (!id || !isKnownChainId(id)) return;
        ids.push(id);
      }
      if (ids.length < CHAT_ATLAS_CLIENT_CHAIN_MIN_LENGTH) return;
      const signature = ids.join('|');
      if (signatures.has(signature)) return;
      signatures.add(signature);
      found.push(Object.freeze(ids));
    };
    const scan = (root) => {
      const seen = new Set();
      const walk = (node, depth) => {
        if (budget <= 0 || depth > CHAT_ATLAS_CLIENT_CHAIN_MAX_DEPTH) return;
        if (!node || typeof node !== 'object') return;
        if (seen.has(node)) return;
        seen.add(node);
        budget -= 1;
        if (Array.isArray(node)) {
          consider(node);
          for (let index = 0; index < node.length && index < 60; index += 1) {
            walk(node[index], depth + 1);
          }
          return;
        }
        let keys;
        try { keys = Object.keys(node); } catch { return; }
        for (let index = 0; index < keys.length && index < 60; index += 1) {
          let child;
          try { child = node[keys[index]]; } catch { continue; }
          walk(child, depth + 1);
        }
      };
      walk(root, 0);
    };
    for (const element of anchors) {
      let fiberKey = null;
      try {
        for (const key of Object.keys(element)) {
          if (key.slice(0, 13) === '__reactFiber$') { fiberKey = key; break; }
        }
      } catch { fiberKey = null; }
      if (!fiberKey) continue;
      let fiber = null;
      try { fiber = element[fiberKey]; } catch { fiber = null; }
      let hops = 0;
      while (fiber && hops < CHAT_ATLAS_CLIENT_CHAIN_MAX_FIBER_HOPS && budget > 0) {
        try { scan(fiber.memoizedProps); } catch {}
        let hook = null;
        try { hook = fiber.memoizedState; } catch { hook = null; }
        let index = 0;
        while (hook && index < 30 && budget > 0) {
          try { scan(hook.memoizedState); } catch {}
          try { hook = hook.next; } catch { hook = null; }
          index += 1;
        }
        try { fiber = fiber.return; } catch { fiber = null; }
        hops += 1;
      }
    }
    return found;
  }

  // Consecutive chain entries must be linked in the graph with no intervening
  // product message. Shells, tool and system nodes may sit between them; a
  // second product node may not, because that would mean the chain skipped a
  // turn it never proved.
  function chatAtlasClientChainLinked(byNodeId, previous, next) {
    if (!previous || !next) return false;
    let cursor = next;
    let guard = 0;
    while (cursor && guard < 4096) {
      if (!cursor.parentId) return false;
      const parent = byNodeId.get(cursor.parentId);
      if (!parent) return false;
      if (parent.nodeId === previous.nodeId) return true;
      if (parent.productUser === true || parent.productAnswer === true) return false;
      cursor = parent;
      guard += 1;
    }
    return false;
  }

  function chatAtlasNativeClientSelectedChain(graph, selectedAnswerIdRaw) {
    const empty = (reason) => chatAtlasFreeze({
      ok: false, reason, messageIds: null, nodes: null, closure: null, candidateCount: 0,
    });
    if (!Array.isArray(graph?.nodes) || !graph.nodes.length) {
      return empty('client-chain-graph-unavailable');
    }
    const target = chatAtlasCompleteIndexIdentity(selectedAnswerIdRaw);
    if (!target) return empty('client-chain-target-unavailable');
    const byNodeId = new Map();
    const byMessageId = new Map();
    const ambiguous = new Set();
    // Every id this graph owns uniquely, product or structural, resolved back
    // to its ONE node. A node contributes both its nodeId and its messageId
    // (usually equal; a branch shell alias makes them differ), and registering
    // the same node twice is not ambiguity — only two DIFFERENT nodes claiming
    // one id is.
    const chainById = new Map();
    const chainAmbiguous = new Set();
    const graphChatId = chatAtlasCompleteIndexIdentity(graph?.chatId);
    const registerChainId = (rawId, node) => {
      const id = chatAtlasCompleteIndexIdentity(rawId);
      if (!id) return;
      const existing = chainById.get(id);
      if (existing && existing !== node) { chainAmbiguous.add(id); return; }
      if (!existing) chainById.set(id, node);
    };
    for (const node of graph.nodes) {
      byNodeId.set(node.nodeId, node);
      registerChainId(node?.nodeId, node);
      registerChainId(node?.messageId, node);
      if (node?.productUser !== true && node?.productAnswer !== true) continue;
      const id = chatAtlasCompleteIndexIdentity(node?.messageId);
      if (!id) continue;
      if (byMessageId.has(id)) { ambiguous.add(id); continue; }
      byMessageId.set(id, node);
    }
    // The conversation id is never a chain member. Live, the only array the
    // fiber walk found before the real chain was the chat id repeated twice;
    // it must stay rejected however the mapping is shaped.
    const known = (id) => (
      id !== graphChatId && chainById.has(id) && !chainAmbiguous.has(id)
    );
    let candidates = [];
    try { candidates = chatAtlasClientChainCollectCandidates(known); } catch { candidates = []; }
    // ── Rendered-turn projection ────────────────────────────────────────────
    // The host array is a sequence of RENDERED TURN ids, not a product-message
    // ancestry path. An assistant turn is named by the FIRST message of its
    // run, while the message actually rendered — and the one the graph's next
    // question descends from — is the LAST product answer in that run. Live:
    //   37ab747d (productAnswer) -> 50cee12f (non-product) -> 16e81a3e  => 16e81a3e
    //   80c1a30f (non-product)   -> 0d2fad64 (non-product) -> 3a1e5e85  => 3a1e5e85
    // This is exactly the window chatAtlasTurnsFromChain already applies, so
    // the projection speaks the qId/primaryAId language the rest of the
    // architecture consumes. Graph-only: no DOM, so virtualized turns project
    // identically to mounted ones.
    const projectAssistantRun = (start) => {
      let cursor = start;
      let last = start.productAnswer === true ? start : null;
      let guard = 0;
      while (cursor && guard < 4096) {
        const continuations = (cursor.childIds || [])
          .map((childId) => byNodeId.get(childId))
          .filter((child) => !!child && child.productUser !== true);
        // The run ends immediately before the next question, or at a leaf.
        if (!continuations.length) break;
        // Two viable continuations are two possible rendered runs: never guess.
        if (continuations.length > 1) return null;
        cursor = continuations[0];
        guard += 1;
        if (cursor.productAnswer === true) last = cursor;
      }
      return last;
    };
    // ── The route H2O itself derives, from the same graph ───────────────────
    // chatAtlasChainToRoot + chatAtlasTurnsFromChain is the ONE turn model in
    // this architecture, including its canonical system-branch-root promotion.
    // The projection below never re-derives an answer identity of its own: it
    // adopts whatever this model says, so the reader emits exactly the
    // qId/primaryAId language every downstream consumer already speaks.
    const modelRouteFor = (terminalNode) => {
      let fullChain = null;
      try { fullChain = chatAtlasChainToRoot(byNodeId, terminalNode); } catch { fullChain = null; }
      if (!fullChain) return null;
      const modelTurns = chatAtlasTurnsFromChain(fullChain, byNodeId);
      if (!Array.isArray(modelTurns) || !modelTurns.length) return null;
      const flat = [];
      const nodes = [];
      for (const turn of modelTurns) {
        const qId = chatAtlasCompleteIndexIdentity(turn?.qId);
        const qNode = qId ? byMessageId.get(qId) : null;
        if (!qId || !qNode) return null;
        flat.push(qId); nodes.push(qNode);
        const primaryAId = chatAtlasCompleteIndexIdentity(turn?.primaryAId);
        if (!primaryAId) continue;
        // A promoted branch-shell alias is a legitimate answer identity that is
        // not a product node, so it is resolved through the ownership index.
        const aNode = byMessageId.get(primaryAId) || chainById.get(primaryAId) || null;
        if (!aNode) return null;
        flat.push(primaryAId); nodes.push(aNode);
      }
      return { flat, nodes, fullChain, turns: modelTurns };
    };
    // ── Rendered-turn validation ────────────────────────────────────────────
    // THIS is the linkage proof for a rendered-turn candidate, and it is
    // STRICTLY STRONGER than the pairwise walk. Every raw entry must name a
    // node ON the model route, in strictly increasing route order; every user
    // entry must open the next model turn in sequence; every assistant entry
    // must fall inside the window of the turn just opened; and every model turn
    // must be named exactly once. A skipped turn, a reorder, a cross-branch
    // splice or an invented answer all fail it. chatAtlasClientChainLinked is
    // left untouched and still guards every other caller.
    const validateCandidate = (ids) => {
      const rawNodes = [];
      let seenTurn = false;
      for (const id of ids) {
        if (!known(id)) return null;
        const node = chainById.get(id);
        if (!node) return null;
        // A genuine graph ROOT wrapper ahead of the first rendered turn is
        // validation evidence and names no turn. Only the real root qualifies —
        // an arbitrary structural id is never a wrapper.
        if (!seenTurn && node.productUser !== true && !node.parentId) continue;
        seenTurn = true;
        rawNodes.push(node);
      }
      // A rendered route always opens on a question.
      if (!rawNodes.length || rawNodes[0].productUser !== true) return null;
      const lastRaw = rawNodes[rawNodes.length - 1];
      const terminal = lastRaw.productUser === true ? lastRaw : projectAssistantRun(lastRaw);
      if (!terminal) return null;
      const model = modelRouteFor(terminal);
      if (!model) return null;
      if (model.flat.length < CHAT_ATLAS_CLIENT_CHAIN_MIN_LENGTH) return null;
      const routeIndex = new Map(model.fullChain.map((node, index) => [node.nodeId, index]));
      const questionIndex = model.turns.map((turn) => {
        const qNode = byMessageId.get(chatAtlasCompleteIndexIdentity(turn?.qId));
        return qNode ? routeIndex.get(qNode.nodeId) : null;
      });
      if (questionIndex.some((index) => index == null)) return null;
      let turnAt = 0;
      let lastRouteIndex = -1;
      for (const node of rawNodes) {
        const index = routeIndex.get(node.nodeId);
        if (index == null) return null;            // names a node off this route
        if (index <= lastRouteIndex) return null;  // repeat or reorder
        lastRouteIndex = index;
        if (node.productUser === true) {
          if (index !== questionIndex[turnAt]) return null;  // skipped/wrong turn
          turnAt += 1;
          continue;
        }
        if (turnAt < 1) return null;                          // answer before any question
        const nextQuestion = questionIndex[turnAt];
        if (nextQuestion != null && index >= nextQuestion) return null;  // outside its turn window
      }
      if (turnAt !== model.turns.length) return null;         // a turn was never named
      return { messageIds: model.flat, nodes: model.nodes, fullChain: model.fullChain };
    };
    const accepted = [];
    const acceptedSignatures = new Set();
    for (const ids of candidates) {
      const projected = validateCandidate(ids);
      if (!projected) continue;
      // Target proof is against the PROJECTED identities only.
      if (!projected.messageIds.includes(target)) continue;
      // Dedupe on the PROJECTED sequence. One selected route found at several
      // React locations, or named through different but equally valid turn
      // ids, is one route — not an ambiguity. Two genuinely different projected
      // routes still fail closed below.
      const signature = projected.messageIds.join('|');
      if (acceptedSignatures.has(signature)) continue;
      acceptedSignatures.add(signature);
      accepted.push({
        ids: projected.messageIds,
        nodes: projected.nodes,
        fullChain: projected.fullChain,
      });
    }
    if (!accepted.length) return empty('client-chain-unavailable');
    if (accepted.length > 1) return empty('client-chain-ambiguous');
    const winner = accepted[0];
    // Closure = the validated root->terminal chain itself. It carries the
    // selected route's real structural and product ancestry and no rival
    // branch, so chooseGraphCandidate can still resolve every fork on the
    // route by membership alone and never guesses.
    const closure = new Set(winner.fullChain.map((node) => node.nodeId));
    return Object.freeze({
      ok: true,
      reason: null,
      messageIds: Object.freeze(winner.ids.slice()),
      nodes: Object.freeze(winner.nodes.slice()),
      closure,
      candidateCount: accepted.length,
    });
  }

  // Convert a proven client chain into the downstream tail of the selected
  // path. This is deliberately NOT a second pairing implementation: the node
  // chain is rebuilt with chatAtlasChainToRoot and paired with
  // chatAtlasTurnsFromChain, exactly as the parity gate does.
  function chatAtlasClientChainDerivedTail(chain, nodeById, context) {
    const bad = (reason) => Object.freeze({ ok: false, reason, turns: null, tailNodeId: null });
    if (!chain || chain.ok !== true || !Array.isArray(chain.nodes) || !chain.nodes.length) return null;
    const anchorOrder = Number(context?.anchorOrder || 0);
    const anchorQId = chatAtlasCompleteIndexIdentity(context?.anchorQId);
    const anchorAnswerId = chatAtlasCompleteIndexIdentity(context?.anchorAnswerId);
    const canonicalPrefix = Array.isArray(context?.canonicalPrefix) ? context.canonicalPrefix : [];
    if (anchorOrder < 1 || !anchorQId || !anchorAnswerId) return bad('client-chain-path-mismatch');
    const terminalNode = nodeById.get(chain.nodes[chain.nodes.length - 1]?.nodeId) || null;
    if (!terminalNode) return bad('client-chain-path-mismatch');
    let chainNodes = null;
    try { chainNodes = chatAtlasChainToRoot(nodeById, terminalNode); } catch { chainNodes = null; }
    if (!chainNodes) return bad('client-chain-path-mismatch');
    const chainTurns = chatAtlasTurnsFromChain(chainNodes, nodeById);
    if (!Array.isArray(chainTurns) || chainTurns.length < anchorOrder) {
      return bad('client-chain-path-mismatch');
    }
    const anchorTurn = chainTurns[anchorOrder - 1];
    if (chatAtlasCompleteIndexIdentity(anchorTurn?.qId) !== anchorQId) {
      return bad('client-chain-path-mismatch');
    }
    if (chatAtlasCompleteIndexIdentity(anchorTurn?.primaryAId) !== anchorAnswerId) {
      return bad('client-chain-path-mismatch');
    }
    // The prefix is matched by question identity. Answer identity before the
    // anchor legitimately differs: the canonical index carries the previously
    // accepted answers, while the chain carries what the page is showing.
    for (let index = 0; index < canonicalPrefix.length; index += 1) {
      if (
        chatAtlasCompleteIndexIdentity(chainTurns[index]?.qId)
        !== chatAtlasCompleteIndexIdentity(canonicalPrefix[index]?.qId)
      ) return bad('client-chain-path-mismatch');
    }
    const tail = [];
    for (let index = anchorOrder; index < chainTurns.length; index += 1) {
      const turn = chainTurns[index];
      const qId = chatAtlasCompleteIndexIdentity(turn?.qId);
      if (!qId) return bad('client-chain-path-mismatch');
      tail.push(chatAtlasFreeze({
        order: index + 1,
        qId,
        turnId: `turn:${qId}`,
        primaryAId: chatAtlasCompleteIndexIdentity(turn?.primaryAId) || null,
        answerVariants: Array.isArray(turn?.answerVariants) ? turn.answerVariants.slice() : [],
        noAnswer: turn?.noAnswer === true,
        stopped: turn?.stopped === true,
        // The client chain decides WHICH graph route is authoritative; the
        // turns themselves are still reconstructed from the identity graph by
        // chatAtlasChainToRoot + chatAtlasTurnsFromChain, so their construction
        // provenance is graph-descent. And a downstream turn that is not
        // mounted cannot claim direct native confirmation.
        provenance: 'graph-descent',
        confirmedByNativeEvidence: false,
      }));
    }
    return Object.freeze({
      ok: true,
      reason: null,
      turns: Object.freeze(tail),
      tailNodeId: terminalNode.nodeId,
      chainTurns: Object.freeze(chainTurns),
    });
  }

  function chatAtlasClientChainProvesAnchor(chain, selectedAnswerIdRaw) {
    const target = chatAtlasCompleteIndexIdentity(selectedAnswerIdRaw);
    if (!target || !chain || chain.ok !== true) return false;
    return Array.isArray(chain.messageIds) && chain.messageIds.includes(target);
  }

  function chatAtlasSelectedPathGraphAnchorNode(graph, selectedAnswerIdRaw) {
    const selectedAnswerId = chatAtlasCompleteIndexIdentity(selectedAnswerIdRaw);
    if (!selectedAnswerId || !Array.isArray(graph?.nodes)) return null;
    const matches = graph.nodes.filter((node) => (
      node?.productAnswer === true
      && chatAtlasCompleteIndexIdentity(node?.messageId) === selectedAnswerId
    ));
    return matches.length === 1 ? matches[0] : null;
  }

  // Does this graph's current_node chain PROVE the newly selected anchor
  // answer? A trusted manual switch the host has already applied leaves
  // current_node inside the selected answer's subtree. A graph captured BEFORE
  // the click leaves it in the previous sibling's subtree, so nothing below
  // the new anchor can be resolved by containment. Presence of the anchor node
  // is not proof: sibling variants are always present in the same graph.
  // Bounded ancestor walk from current_node; equality counts as proof.
  function chatAtlasSelectedPathGraphProvesAnchor(graph, selectedAnswerIdRaw) {
    const anchorAnswerNode = chatAtlasSelectedPathGraphAnchorNode(graph, selectedAnswerIdRaw);
    if (!anchorAnswerNode || !Array.isArray(graph?.nodes)) return false;
    const currentNodeId = chatAtlasCompleteIndexIdentity(graph.currentNode);
    if (!currentNodeId) return false;
    const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    const seen = new Set();
    let cursor = nodeById.get(currentNodeId) || null;
    let visits = 0;
    while (cursor && visits <= 4096) {
      visits += 1;
      if (cursor.nodeId === anchorAnswerNode.nodeId) return true;
      if (seen.has(cursor.nodeId)) return false;
      seen.add(cursor.nodeId);
      if (!cursor.parentId) return false;
      cursor = nodeById.get(cursor.parentId) || null;
    }
    return false;
  }

  // Only derivation reasons whose resolution genuinely depends on current_node
  // containment qualify for the stale-evidence handoff. Every other reason is
  // a structural fault a fresher graph cannot repair, and must stay terminal.
  const CHAT_ATLAS_STALE_GRAPH_DERIVATION_REASONS = Object.freeze(new Set([
    'fork-unresolved',
  ]));

  // Pre-click evidence, or a real verdict? This is the whole distinction:
  //   graph does NOT prove the selected anchor -> stale/pre-click -> pending
  //   graph DOES prove it and the fork is still equal -> real -> fail closed
  function chatAtlasSelectedPathStaleGraphEvidence(graph, selectedAnswerIdRaw, reason) {
    return CHAT_ATLAS_STALE_GRAPH_DERIVATION_REASONS.has(
      chatAtlasCompleteIndexCode(reason, 'derivation-failed', 64),
    ) && !chatAtlasSelectedPathGraphProvesAnchor(graph, selectedAnswerIdRaw);
  }

  function chatAtlasDeriveSelectedPath(graph, intent, selectedAnswerIdRaw) {
    let lastForkDiagnostics = null;
    const fail = (reason) => {
      selectedPathAcquisitionState.lastDerivationDiagnostics = chatAtlasFreeze({
        ok: false,
        reason: chatAtlasCompleteIndexCode(reason, 'derivation-failed', 64),
        pathLength: 0,
        fingerprint: null,
        tailNodeId: null,
        graphCurrentNodeId: chatAtlasCompleteIndexIdentity(graph?.currentNode) || null,
        graphNodeCount: Number(graph?.nodeCount || 0),
        fork: lastForkDiagnostics,
        turns: Object.freeze([]),
      });
      return { ok: false, reason };
    };
    const selectedAnswerId = chatAtlasCompleteIndexIdentity(selectedAnswerIdRaw);
    const canonical = completeTurnIndexAuthorityState.index;
    const turns = Array.isArray(canonical?.turns) ? canonical.turns : [];
    const qId = chatAtlasCompleteIndexIdentity(intent?.qId);
    const canonicalMatches = turns.filter((turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === qId);
    if (canonicalMatches.length !== 1) return fail('anchor-canonical-invalid');
    const anchorCanonical = canonicalMatches[0];
    const anchorOrder = Number(anchorCanonical.order || 0);
    if (
      anchorOrder < 1
      || !selectedAnswerId
      || !Array.isArray(anchorCanonical.answerVariants)
      || !anchorCanonical.answerVariants.includes(selectedAnswerId)
    ) return fail('anchor-answer-not-canonical-variant');

    const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    const anchorAnswerNode = chatAtlasSelectedPathGraphAnchorNode(graph, selectedAnswerId);
    if (!anchorAnswerNode) return fail('anchor-not-in-graph');
    let visits = 0;
    const visit = (node) => {
      visits += 1;
      return !!node && visits <= 4096;
    };
    const parentSeen = new Set();
    let cursor = anchorAnswerNode;
    let anchorQuestionNode = null;
    while (cursor?.parentId) {
      if (parentSeen.has(cursor.nodeId)) return fail('anchor-linkage-invalid');
      parentSeen.add(cursor.nodeId);
      cursor = nodeById.get(cursor.parentId);
      if (!visit(cursor)) return fail('derivation-bounds-exceeded');
      if (cursor?.productUser === true) {
        anchorQuestionNode = cursor;
        break;
      }
    }
    if (
      !anchorQuestionNode
      || chatAtlasCompleteIndexIdentity(anchorQuestionNode.messageId) !== qId
    ) return fail('anchor-linkage-invalid');

    const prefixQIds = [];
    const prefixSeen = new Set();
    cursor = anchorQuestionNode;
    let rootNodeId = cursor.nodeId;
    while (cursor) {
      if (prefixSeen.has(cursor.nodeId)) return fail('anchor-linkage-invalid');
      prefixSeen.add(cursor.nodeId);
      if (cursor.productUser === true) {
        const prefixQId = chatAtlasCompleteIndexIdentity(cursor.messageId);
        if (!prefixQId) return fail('prefix-mismatch');
        prefixQIds.push(prefixQId);
      }
      rootNodeId = cursor.nodeId;
      if (!cursor.parentId) break;
      cursor = nodeById.get(cursor.parentId);
      if (!visit(cursor)) return fail('derivation-bounds-exceeded');
    }
    prefixQIds.reverse();
    const canonicalPrefix = turns.slice(0, anchorOrder).map((turn) => turn.qId);
    if (
      prefixQIds.length !== canonicalPrefix.length
      || prefixQIds.some((prefixQId, index) => prefixQId !== canonicalPrefix[index])
    ) return fail('prefix-mismatch');

    const copyCanonical = (turn, provenance, primaryAId = turn.primaryAId) => {
      const variants = Array.isArray(turn.answerVariants) ? turn.answerVariants.slice() : [];
      if (primaryAId && variants.includes(primaryAId) && variants[variants.length - 1] !== primaryAId) {
        variants.splice(variants.indexOf(primaryAId), 1);
        variants.push(primaryAId);
      }
      return chatAtlasFreeze({
        order: Number(turn.order),
        qId: turn.qId,
        turnId: turn.turnId,
        primaryAId: primaryAId || null,
        answerVariants: variants,
        noAnswer: turn.noAnswer === true,
        stopped: turn.stopped === true,
        provenance,
        confirmedByNativeEvidence: provenance === 'anchor',
      });
    };
    const path = turns.slice(0, anchorOrder - 1)
      .map((turn) => copyCanonical(turn, 'canonical-prefix'));
    path.push(copyCanonical(anchorCanonical, 'anchor', selectedAnswerId));
    const pathQIds = new Set(path.map((turn) => turn.qId));
    const canonicalQIds = new Set(turns.map((turn) => turn.qId));
    const mountedEvidence = intent?.mountedEvidence instanceof Map
      ? intent.mountedEvidence
      : new Map();

    const collectBoundary = (startNode) => {
      const users = [];
      const leaves = startNode?.childIds?.length ? [] : [startNode];
      const seen = new Set();
      const stack = (startNode?.childIds || []).slice().reverse();
      while (stack.length) {
        const node = nodeById.get(stack.pop());
        if (!visit(node)) return { ok: false, reason: 'derivation-bounds-exceeded' };
        if (seen.has(node.nodeId)) return { ok: false, reason: 'fork-unresolved' };
        seen.add(node.nodeId);
        if (node.productUser === true) {
          users.push(node);
          continue;
        }
        if (!node.childIds.length) {
          leaves.push(node);
          continue;
        }
        for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
          stack.push(node.childIds[index]);
        }
      }
      return { ok: true, users, leaves };
    };
    const collectAnswers = (questionNode) => {
      const answers = [];
      const answerIdentities = [];
      const users = [];
      const leaves = questionNode?.childIds?.length ? [] : [questionNode];
      const seen = new Set();
      let stopped = false;
      const stack = (questionNode?.childIds || []).slice().reverse();
      while (stack.length) {
        const node = nodeById.get(stack.pop());
        if (!visit(node)) return { ok: false, reason: 'derivation-bounds-exceeded' };
        if (seen.has(node.nodeId)) return { ok: false, reason: 'descent-variant-ambiguous' };
        seen.add(node.nodeId);
        if (node.productUser === true) {
          users.push(node);
          continue;
        }
        if (node.stopped === true) stopped = true;
        if (node.productAnswer === true) answers.push(node);
        if (node.productAnswer === true || node.branchShellAlias === true) {
          const answerId = chatAtlasCompleteIndexIdentity(node.messageId);
          if (answerId && !answerIdentities.includes(answerId)) answerIdentities.push(answerId);
        }
        if (!node.childIds.length) leaves.push(node);
        for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
          stack.push(node.childIds[index]);
        }
      }
      return { ok: true, answers, answerIdentities, users, leaves, stopped };
    };
    const clientChainClosure = intent?.clientSelectedChainClosure instanceof Set
      && intent.clientSelectedChainClosure.size
      ? intent.clientSelectedChainClosure
      : null;
    const currentGraphNode = nodeById.get(chatAtlasCompleteIndexIdentity(graph.currentNode)) || null;
    const currentNodeInsideSelectedAnswer = nodeDescendsFrom(
      currentGraphNode,
      anchorAnswerNode,
    );
    // Rank only terminal-complete graph routes. This is deliberately not a
    // longest-prefix heuristic: every ranked candidate must reach a real leaf,
    // the maximum identity route must be unique, and equal maxima fail closed.
    // Mounted shells never participate. They are hydration evidence and, in
    // the live defect, exposed only the terminal 1/3 edit while 27..39 stayed
    // unmounted in the same retained graph.
    const terminalRouteProof = (startNode) => {
      if (!startNode) return {
        ok: false,
        depth: -1,
        leafId: null,
        routes: Object.freeze([]),
        branchShellAliasResolved: false,
      };
      const stack = [{
        node: startNode,
        depth: 0,
        seen: new Set(),
        identities: [],
        nodeIds: [],
      }];
      const terminalRoutes = [];
      let rankedVisits = 0;
      let branchShellAliasResolved = false;
      while (stack.length) {
        const item = stack.pop();
        const node = item.node;
        rankedVisits += 1;
        if (!node || rankedVisits > 4096 || item.seen.has(node.nodeId)) {
          return {
            ok: false,
            depth: -1,
            leafId: null,
            routes: Object.freeze([]),
            branchShellAliasResolved,
          };
        }
        const nextSeen = new Set(item.seen);
        nextSeen.add(node.nodeId);
        const nodeIds = item.nodeIds.concat(node.nodeId).slice(-64);
        const depth = item.depth + (node.productUser === true ? 1 : 0);
        if (node.branchShellAlias === true) branchShellAliasResolved = true;
        const identity = chatAtlasCompleteIndexIdentity(node.messageId);
        const identities = item.identities.slice();
        if (node.productUser === true && identity) identities.push(`q:${identity}`);
        // A branch shell is structural identity for selecting the answer, but
        // it is not a second emitted answer. Logical terminal routes are
        // ranked by the validated product-turn identities they would emit.
        if (node.productAnswer === true && identity) identities.push(`a:${identity}`);
        if (!node.childIds.length) {
          terminalRoutes.push({
            depth,
            leafId: node.nodeId,
            nodeIds,
            identityKey: JSON.stringify(identities),
            identityHash: `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(identities))}`,
          });
          continue;
        }
        for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
          stack.push({
            node: nodeById.get(node.childIds[index]),
            depth,
            seen: nextSeen,
            identities,
            nodeIds,
          });
        }
      }
      const routes = Object.freeze(terminalRoutes.slice(0, 16).map((route) => Object.freeze({
        leafId: route.leafId,
        emittedTurnCount: route.depth,
        orderedIdentityHash: route.identityHash,
        orderedNodeIds: Object.freeze(route.nodeIds.slice()),
      })));
      if (!terminalRoutes.length) return {
        ok: false,
        depth: -1,
        leafId: null,
        routes,
        branchShellAliasResolved,
      };
      const depth = Math.max(...terminalRoutes.map((route) => route.depth));
      const maxima = terminalRoutes.filter((route) => route.depth === depth);
      const logicalMaxima = new Map(maxima.map((route) => [route.identityKey, route]));
      return logicalMaxima.size === 1
        ? {
          ok: true,
          depth,
          leafId: logicalMaxima.values().next().value.leafId,
          routes,
          terminalRoutes,
          branchShellAliasResolved,
        }
        : {
          ok: false,
          depth,
          leafId: null,
          routes,
          terminalRoutes,
          branchShellAliasResolved,
        };
    };
    const chooseGraphCandidate = (candidates, contextNode = null, phase = 'graph-fork') => {
      const unique = [];
      const seen = new Set();
      for (const candidate of candidates || []) {
        const identity = chatAtlasCompleteIndexIdentity(candidate?.nodeId);
        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        unique.push(candidate);
      }
      if (unique.length === 1) return unique[0];
      if (!unique.length) return null;
      // NATIVE CLIENT SELECTION WINS. When the page's own selected chain is
      // proven for this manual selection it decides every fork below the
      // anchor -- question edits and answer regenerations alike -- by
      // membership, never by ranking. A fork the chain does not name is a
      // fork it never proved, so it fails closed rather than guessing.
      if (clientChainClosure) {
        const onChain = unique.filter(
          (candidate) => clientChainClosure.has(candidate?.nodeId),
        );
        if (onChain.length === 1) return onChain[0];
        return null;
      }
      const candidateType = (candidate) => {
        if (candidate?.productUser === true) return 'product-user';
        if (candidate?.branchShellAlias === true) return 'branch-shell-alias';
        if (candidate?.productAnswer === true) return 'product-answer';
        return 'structural';
      };
      const ranked = unique.map((candidate) => ({
        candidate,
        proof: terminalRouteProof(candidate),
      }));
      const terminalCandidates = ranked.flatMap((entry) => (
        (entry.proof.terminalRoutes || []).map((route) => ({ ...route, entry }))
      ));
      const maxDepth = terminalCandidates.length
        ? Math.max(...terminalCandidates.map((route) => route.depth))
        : -1;
      const rememberFork = (winner, reason) => {
        lastForkDiagnostics = chatAtlasFreeze({
          phase,
          forkNodeId: chatAtlasCompleteIndexIdentity(contextNode?.nodeId) || null,
          forkQId: contextNode?.productUser === true
            ? chatAtlasCompleteIndexIdentity(contextNode?.messageId) || null
            : null,
          parentNodeId: chatAtlasCompleteIndexIdentity(contextNode?.parentId) || null,
          candidateChildIds: Object.freeze(unique.map((candidate) => candidate.nodeId)),
          graphCurrentNodeId: chatAtlasCompleteIndexIdentity(currentGraphNode?.nodeId) || null,
          currentNodeInsideTargetAnswerSubtree: currentNodeInsideSelectedAnswer,
          winnerNodeId: chatAtlasCompleteIndexIdentity(winner?.nodeId) || null,
          decisionReason: reason,
          candidates: Object.freeze(ranked.map((entry) => Object.freeze({
            nodeId: entry.candidate.nodeId,
            parentId: chatAtlasCompleteIndexIdentity(entry.candidate.parentId) || null,
            role: String(entry.candidate.role || '') || null,
            type: candidateType(entry.candidate),
            insideTargetAnswerSubtree: nodeDescendsFrom(entry.candidate, anchorAnswerNode),
            currentNodeBelongs: nodeDescendsFrom(currentGraphNode, entry.candidate),
            branchShellAliasResolved: entry.proof.branchShellAliasResolved === true,
            terminalLeaves: Object.freeze(entry.proof.routes.map((route) => route.leafId)),
            terminalRoutes: entry.proof.routes,
            maximumEmittedTurnCount: entry.proof.depth,
            accepted: winner?.nodeId === entry.candidate.nodeId,
            rejectionReason: winner?.nodeId === entry.candidate.nodeId
              ? null
              : !(entry.proof.terminalRoutes || []).length
                ? 'candidate-terminal-route-unavailable'
                : entry.proof.depth < maxDepth
                  ? 'shorter-terminal-complete-route'
                  : 'equal-terminal-complete-route',
          }))),
        });
      };
      if (currentNodeInsideSelectedAnswer) {
        const selectedMatches = unique.filter((candidate) => (
          nodeDescendsFrom(currentGraphNode, candidate)
        ));
        if (selectedMatches.length === 1) {
          rememberFork(selectedMatches[0], 'current-node-inside-target-subtree');
          return selectedMatches[0];
        }
        if (selectedMatches.length > 1) {
          rememberFork(null, 'current-node-matches-multiple-candidates');
          return null;
        }
      }
      if (!terminalCandidates.length) {
        rememberFork(null, 'candidate-terminal-proof-unavailable');
        return null;
      }
      // Resolve the fork from the globally maximal terminal-complete logical
      // route. An internally ambiguous shorter candidate cannot veto a unique
      // longer route; equal maximal logical routes still fail closed.
      const maxima = terminalCandidates.filter((route) => route.depth === maxDepth);
      const maximumLogicalRoutes = new Map(
        maxima.map((route) => [route.identityKey, route]),
      );
      const maximumCandidateIds = new Set(
        maxima.map((route) => route.entry.candidate.nodeId),
      );
      const winner = maximumLogicalRoutes.size === 1 && maximumCandidateIds.size === 1
        ? maxima[0].entry.candidate
        : null;
      rememberFork(winner, winner
        ? 'unique-global-terminal-complete-maximum'
        : 'equal-global-terminal-complete-maximum');
      return winner;
    };
    const chooseAnswer = (questionQId, answerNodes) => {
      const unique = [];
      const seen = new Set();
      for (const node of answerNodes) {
        const answerId = chatAtlasCompleteIndexIdentity(node.messageId);
        if (!answerId || seen.has(answerId)) continue;
        seen.add(answerId);
        unique.push(node);
      }
      const endpoints = unique.filter((candidate) => !unique.some((other) => (
        other !== candidate && nodeDescendsFrom(other, candidate)
      )));
      if (endpoints.length === 1) return { node: endpoints[0], confirmed: false, variants: unique };
      if (unique.length < 1) return { node: null, confirmed: false, variants: [] };
      const selected = chooseGraphCandidate(endpoints, nodeById.get(questionQId), 'answer-variant');
      return selected
        ? { node: selected, confirmed: false, variants: unique }
        : { node: null, confirmed: false, variants: unique, ambiguous: true };
    };
    function nodeDescendsFrom(node, ancestorNode) {
      if (!node || !ancestorNode) return false;
      const seen = new Set();
      let current = node;
      while (current) {
        if (current.nodeId === ancestorNode.nodeId) return true;
        if (!current.parentId || seen.has(current.nodeId)) return false;
        seen.add(current.nodeId);
        current = nodeById.get(current.parentId);
      }
      return false;
    }
    const questionBranchRoot = (questionNode, node) => {
      if (!questionNode || !node) return null;
      const seen = new Set();
      let current = node;
      while (current?.parentId && current.parentId !== questionNode.nodeId) {
        if (seen.has(current.nodeId)) return null;
        seen.add(current.nodeId);
        current = nodeById.get(current.parentId);
      }
      return current?.parentId === questionNode.nodeId ? current : null;
    };
    const chooseContinuationQuestion = (questionNode, selected, candidates) => {
      const unique = [];
      const seen = new Set();
      for (const candidate of candidates || []) {
        const qId = chatAtlasCompleteIndexIdentity(candidate?.messageId);
        if (!qId || seen.has(qId)) continue;
        seen.add(qId);
        unique.push(candidate);
      }
      if (!unique.length) return { node: null, ambiguous: false };
      const selectedRoot = questionBranchRoot(questionNode, selected?.node);
      const sameSelectedBranch = unique.filter((candidate) => (
        nodeDescendsFrom(candidate, selected?.node)
        || (
          selectedRoot
          && questionBranchRoot(questionNode, candidate)?.nodeId === selectedRoot.nodeId
        )
      ));
      if (sameSelectedBranch.length === 1) {
        return { node: sameSelectedBranch[0], ambiguous: false };
      }
      if (sameSelectedBranch.length > 1) {
        const selectedQuestion = chooseGraphCandidate(sameSelectedBranch, questionNode, 'selected-answer-continuation');
        return selectedQuestion
          ? { node: selectedQuestion, ambiguous: false }
          : { node: null, ambiguous: true };
      }
      // Some legitimate host graphs place the next user as a sibling of the
      // completed answer under the same question boundary. Exact uniqueness
      // (one selected answer and one continuation user) proves that chain;
      // multiple users remain a genuine branch ambiguity and fail closed.
      if (unique.length === 1 && selected?.variants?.length === 1) {
        return { node: unique[0], ambiguous: false };
      }
      const selectedQuestion = chooseGraphCandidate(unique, questionNode, 'question-continuation');
      return selectedQuestion
        ? { node: selectedQuestion, ambiguous: false }
        : { node: null, ambiguous: true };
    };

    let selectedNode = anchorAnswerNode;
    let tailNodeId = selectedNode.nodeId;
    // Set when a no-answer mid-turn already identified the next question, so
    // the walk continues from it instead of re-collecting an answer boundary.
    let pendingQuestion = null;
    // WHOLE-PATH NATIVE CLIENT AUTHORITY. A validated client chain is the path
    // for this trusted manual selection, not merely a fork tie-breaker. A
    // fork-free continuation never reaches chooseGraphCandidate, so constraining
    // forks alone let derivation walk a completely different route while the
    // page was on another one. When the chain is present it supplies the tail
    // and the independent descent below does not run at all.
    const clientTail = chatAtlasClientChainDerivedTail(
      intent?.clientSelectedChain || null,
      nodeById,
      {
        anchorOrder,
        anchorQId: qId,
        anchorAnswerId: selectedAnswerId,
        canonicalPrefix: turns.slice(0, anchorOrder - 1),
      },
    );
    if (clientTail && clientTail.ok !== true) return fail(clientTail.reason);
    if (clientTail) {
      for (const turn of clientTail.turns) path.push(turn);
      tailNodeId = clientTail.tailNodeId;
    }
    while (!clientTail) {
      if (path.length > 512) return fail('derivation-bounds-exceeded');
      let questionNode = pendingQuestion;
      pendingQuestion = null;
      if (!questionNode) {
        const boundary = collectBoundary(selectedNode);
        if (!boundary.ok) return fail(boundary.reason);
        if (!boundary.users.length) {
          if (boundary.leaves.length !== 1) return fail('fork-unresolved');
          tailNodeId = boundary.leaves[0].nodeId;
          break;
        }
        if (boundary.leaves.length) return fail('fork-unresolved');
        questionNode = chooseGraphCandidate(boundary.users, selectedNode, 'answer-boundary');
        if (!questionNode) return fail('fork-unresolved');
      }
      const nextQId = chatAtlasCompleteIndexIdentity(questionNode.messageId);
      if (!nextQId) return fail('duplicate-qid');
      if (pathQIds.has(nextQId)) return fail('duplicate-qid');
      if (canonicalQIds.has(nextQId)) return fail('descent-qid-already-canonical');
      pathQIds.add(nextQId);

      const answerResult = collectAnswers(questionNode);
      if (!answerResult.ok) return fail(answerResult.reason);
      const selected = chooseAnswer(nextQId, answerResult.answers);
      if (selected.ambiguous) return fail('descent-variant-ambiguous');
      if (!selected.node) {
        if (!answerResult.users.length) {
          // Genuine no-answer TAIL: nothing continues beneath this question.
          if (answerResult.leaves.length !== 1) return fail('fork-unresolved');
          path.push(chatAtlasFreeze({
            order: path.length + 1,
            qId: nextQId,
            turnId: `turn:${nextQId}`,
            primaryAId: null,
            answerVariants: [],
            noAnswer: true,
            stopped: answerResult.stopped === true,
            provenance: 'graph-descent',
            confirmedByNativeEvidence: false,
          }));
          tailNodeId = answerResult.leaves[0].nodeId;
          break;
        }
        // No-answer MID-turn: the question got no product answer, but the
        // branch genuinely continues beneath it (an empty/stopped generation
        // or a consecutive user send). This was the exact spot the live
        // 39-turn branch died at its unanswered turn: failing here (the old
        // 'gap-in-path') froze authority on the outgoing branch, and every
        // partial 20/21 settle followed. Push the no-answer turn and keep
        // walking from the continuation question.
        if (answerResult.leaves.length) return fail('fork-unresolved');
        const continuation = chooseGraphCandidate(answerResult.users, questionNode, 'no-answer-continuation');
        if (!continuation) return fail('fork-unresolved');
        path.push(chatAtlasFreeze({
          order: path.length + 1,
          qId: nextQId,
          turnId: `turn:${nextQId}`,
          primaryAId: null,
          answerVariants: [],
          noAnswer: true,
          stopped: answerResult.stopped === true,
          provenance: 'graph-descent',
          confirmedByNativeEvidence: false,
        }));
        tailNodeId = questionNode.nodeId;
        pendingQuestion = continuation;
        continue;
      }
      const selectedBranchRoot = questionBranchRoot(questionNode, selected.node);
      const primaryNode = selectedBranchRoot?.branchShellAlias === true
        ? selectedBranchRoot
        : selected.node;
      const primaryAId = primaryNode.messageId;
      const answerVariants = answerResult.answerIdentities.slice();
      if (!answerVariants.includes(primaryAId)) answerVariants.push(primaryAId);
      if (answerVariants[answerVariants.length - 1] !== primaryAId) {
        answerVariants.splice(answerVariants.indexOf(primaryAId), 1);
        answerVariants.push(primaryAId);
      }
      path.push(chatAtlasFreeze({
        order: path.length + 1,
        qId: nextQId,
        turnId: `turn:${nextQId}`,
        primaryAId,
        answerVariants,
        noAnswer: false,
        stopped: primaryNode.stopped === true,
        provenance: 'graph-descent',
        confirmedByNativeEvidence: selected.confirmed,
      }));
      const continuation = chooseContinuationQuestion(
        questionNode,
        selected,
        answerResult.users,
      );
      if (continuation.ambiguous) return fail('fork-unresolved');
      selectedNode = selected.node;
      tailNodeId = selectedNode.nodeId;
      if (continuation.node) pendingQuestion = continuation.node;
    }
    if (
      path.length > 512
      || path.some((turn, index) => turn.order !== index + 1)
      || new Set(path.map((turn) => turn.qId)).size !== path.length
    ) return fail(path.length > 512 ? 'derivation-bounds-exceeded' : 'duplicate-qid');
    // Exact whole-path parity against the client chain: identical count,
    // per-turn question identity across the route, per-turn answer identity
    // from the anchor down, and the same terminal. Any divergence fails closed
    // with its own reason rather than publishing a guessed route.
    if (clientTail) {
      const chainTurns = clientTail.chainTurns;
      if (path.length !== chainTurns.length) return fail('client-chain-path-mismatch');
      for (let index = 0; index < path.length; index += 1) {
        if (
          chatAtlasCompleteIndexIdentity(path[index]?.qId)
          !== chatAtlasCompleteIndexIdentity(chainTurns[index]?.qId)
        ) return fail('client-chain-path-mismatch');
        if (
          index >= anchorOrder - 1
          && chatAtlasCompleteIndexIdentity(path[index]?.primaryAId)
            !== chatAtlasCompleteIndexIdentity(chainTurns[index]?.primaryAId)
        ) return fail('client-chain-path-mismatch');
      }
      if (tailNodeId !== clientTail.tailNodeId) return fail('client-chain-path-mismatch');
    }
    const pathFingerprint = chatAtlasCompleteIndexFingerprint(path);
    const diagnosticTurns = path.map((turn) => {
      const questionNodes = graph.nodes.filter((node) => (
        node.productUser === true && node.messageId === turn.qId
      ));
      const answerNodes = turn.primaryAId == null
        ? []
        : graph.nodes.filter((node) => (
          node.productAnswer === true && node.messageId === turn.primaryAId
        ));
      const questionNode = questionNodes.length === 1 ? questionNodes[0] : null;
      const answerNode = answerNodes.length === 1 ? answerNodes[0] : null;
      return Object.freeze({
        order: turn.order,
        qId: turn.qId,
        primaryAId: turn.primaryAId,
        noAnswer: turn.noAnswer,
        questionNodeId: questionNode?.nodeId || null,
        questionParentId: questionNode?.parentId || null,
        questionChildIds: Object.freeze(Array.from(questionNode?.childIds || [])),
        answerNodeId: answerNode?.nodeId || null,
        answerParentId: answerNode?.parentId || null,
        answerChildIds: Object.freeze(Array.from(answerNode?.childIds || [])),
        questionRole: questionNode?.role || null,
        answerRole: answerNode?.role || null,
        decision: turn.noAnswer ? 'emit-no-answer-and-continue' : 'emit-exact-product-answer',
      });
    });
    selectedPathAcquisitionState.lastDerivationDiagnostics = chatAtlasFreeze({
      ok: true,
      reason: null,
      pathLength: path.length,
      fingerprint: pathFingerprint,
      tailNodeId,
      graphCurrentNodeId: chatAtlasCompleteIndexIdentity(graph?.currentNode) || null,
      graphNodeCount: Number(graph?.nodeCount || 0),
      fork: lastForkDiagnostics,
      turns: Object.freeze(diagnosticTurns),
    });
    const proof = chatAtlasFreeze({
      anchorQId: qId,
      anchorSelectedAId: selectedAnswerId,
      rootNodeId,
      tailNodeId,
      pathLength: path.length,
      canonicalPrefixLength: anchorOrder,
      canonicalFingerprint: String(canonical?.sourceFingerprint || ''),
      graphCapturedAt: String(graph?.capturedAt || ''),
      token: String(intent?.token || ''),
      chatId: String(intent?.chatId || ''),
      routeKey: String(intent?.routeKey || ''),
      generation: Number(intent?.generation || 0),
      staleRevision: Number(intent?.staleRevision || 0),
      reason: 'selected-path-proven',
      source: 'host-identity-graph',
    });
    return { ok: true, path: chatAtlasFreeze(path), proof };
  }

  function chatAtlasSelectedPathProofValid(candidate) {
    const proof = candidate?.proof;
    const path = candidate?.path;
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const index = completeTurnIndexAuthorityState.index;
    if (
      !proof
      || !Array.isArray(path)
      || !path.length
      || !intent
      || proof.token !== intent.token
      || proof.chatId !== completeTurnIndexAuthorityState.chatId
      || proof.routeKey !== completeTurnIndexAuthorityState.routeKey
      || proof.generation !== Number(completeTurnIndexAuthorityState.generation || 0)
      || proof.staleRevision !== Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      || proof.anchorQId !== completeTurnIndexAuthorityState.branchSelectionStaleQId
      || proof.canonicalFingerprint !== String(index?.sourceFingerprint || '')
      || proof.pathLength !== path.length
      || path.some((turn, indexValue) => Number(turn?.order) !== indexValue + 1)
      || new Set(path.map((turn) => turn?.qId)).size !== path.length
    ) return false;
    return completeTurnIndexAuthorityState.branchSelectionStale === true;
  }

  async function chatAtlasSelectedPathRefetch(intent) {
    const token = String(intent?.token || '');
    if (!token || selectedPathAcquisitionState.refetchAttemptedForToken === token) {
      return chatAtlasSelectedPathFail(
        'anchor-not-in-graph',
        intent,
        selectedPathAcquisitionState.anchorSelectedAId,
      );
    }
    selectedPathAcquisitionState.refetchAttemptedForToken = token;
    selectedPathAcquisitionState.status = 'inactive';
    selectedPathAcquisitionState.reason = 'identity-graph-refetch-pending';
    const provider = H2O.archiveBoot?.fetchConversationTurnIndex;
    if (typeof provider !== 'function') {
      return chatAtlasSelectedPathFail(
        'anchor-not-in-graph',
        intent,
        selectedPathAcquisitionState.anchorSelectedAId,
      );
    }
    selectedPathAcquisitionState.refetchActiveForToken = token;
    chatAtlasBranchTransactionTrace('refetch-start', { token });
    try {
      let result = null;
      try {
        // The provider's ambient 12s budget aborts mid-body on a conversation
        // this large; the archive engine swallows that abort while parsing and
        // reports 'mapping-invalid', so the one bounded refetch is spent
        // without ever obtaining fresh current_node evidence. This is the
        // single trusted, user-initiated, once-per-selection request in the
        // system, so it is the one call entitled to wait longer than ambient.
        // Scoped deliberately to this call: TURN_INDEX_FETCH_TIMEOUT_MS and
        // every other consumer's budget stay untouched.
        result = await provider(intent.chatId, {
          includeIdentityGraph: true,
          timeoutMs: 30000,
        });
      } catch {}
      const currentIntent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      const scopeCurrent = currentIntent?.token === token
        && currentIntent?.qId === intent.qId
        && completeTurnIndexAuthorityState.branchSelectionStale === true
        && Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0) === Number(intent.staleRevision || 0)
        && completeTurnIndexAuthorityState.chatId === intent.chatId
        && completeTurnIndexAuthorityState.routeKey === intent.routeKey
        && Number(completeTurnIndexAuthorityState.generation || 0) === Number(intent.generation || 0);
      if (!scopeCurrent) {
        return chatAtlasClearSelectedPathAcquisition('identity-graph-refetch-scope-drift');
      }
      const retainedCurrentGraph = chatAtlasRetainIdentityGraph(result, {
        chatId: intent.chatId,
        routeKey: intent.routeKey,
        generation: intent.generation,
      });
      if (retainedCurrentGraph) {
        const localPublication = chatAtlasTryPublishRetainedBranchTransaction(
          'selected-path-graph-refetch',
        );
        if (localPublication?.published === true) return getSelectedPathAcquisitionStatus();
      }
      const retained = selectedPathAcquisitionState.graph;
      if (
        !retained
        || !chatAtlasSelectedPathGraphAnchorNode(
          retained.identityGraph,
          selectedPathAcquisitionState.anchorSelectedAId,
        )
      ) {
        return chatAtlasSelectedPathFail(
          'anchor-not-in-graph',
          intent,
          selectedPathAcquisitionState.anchorSelectedAId,
        );
      }
      return chatAtlasSelectedPathEvaluate(chatAtlasLedgerState.members);
    } finally {
      if (selectedPathAcquisitionState.refetchActiveForToken === token) {
        selectedPathAcquisitionState.refetchActiveForToken = null;
      }
    }
  }

  // A trusted selection whose branch transaction has already PUBLISHED is a
  // completed selection. Re-deriving it from live DOM evidence afterwards can
  // only produce a contradiction — the native DOM has by then settled onto the
  // new branch, so the anchor's answer legitimately equals the intent's prior
  // answer and the derivation reports 'selected-answer-not-changed' for a
  // selection that in fact succeeded. The published transaction is the
  // authority for its own token; this returns the outcome it already recorded.
  function chatAtlasSelectedPathPublishedForToken(token) {
    const wanted = String(token || '');
    if (!wanted) return false;
    const transaction = completeTurnIndexAuthorityState.branchTransactionState;
    if (transaction?.state !== 'published') return false;
    if (String(transaction.token || '') !== wanted) return false;
    if (String(selectedPathAcquisitionState.token || '') !== wanted) return false;
    // The published-path evidence is the PUBLICATION DECISION itself. Keying
    // on an active overlay was circular: chatAtlasSelectedPathOverlayEvaluate
    // refuses to build a candidate while the acquisition is unproven, so the
    // overlay can never be the thing that proves the acquisition.
    const decision = selectedPathAcquisitionState.lastPublicationDecision;
    if (decision?.published !== true) return false;
    if (!(Number(decision.acceptedCount || 0) > 0)) return false;
    if (!chatAtlasCompleteIndexIdentity(decision.acceptedFingerprint)) return false;
    // The retained graph that produced it must still be the current scope.
    const retained = selectedPathAcquisitionState.graph;
    return !!retained
      && retained.chatId === String(completeTurnIndexAuthorityState.chatId || '')
      && retained.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
      && Number(retained.generation || 0) === Number(completeTurnIndexAuthorityState.generation || 0);
  }

  // A published selection owns its acquisition record for the lifetime of that
  // publication. Every demotion path in the evaluator — the
  // 'trusted-intent-unavailable' clear as well as the later
  // 'selected-answer-not-changed' derivation — is gated behind this, BEFORE any
  // of them can mutate state. The token comes from the ACQUISITION, not the
  // intent: the intent legitimately disappears once the selection completes,
  // and its disappearance must not erase the completed outcome.
  function chatAtlasSelectedPathHoldPublished() {
    const token = String(selectedPathAcquisitionState.token || '')
      || String(completeTurnIndexAuthorityState.trustedSelectedPathIntent?.token || '');
    if (!chatAtlasSelectedPathPublishedForToken(token)) return null;
    // No restorative mutation: the primitives can no longer damage a
    // published record, so there is nothing to repair here.
    return getSelectedPathAcquisitionStatus();
  }

  function chatAtlasSelectedPathEvaluate(members = []) {
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const index = completeTurnIndexAuthorityState.index;
    const held = chatAtlasSelectedPathHoldPublished();
    if (held) return held;
    if (
      completeTurnIndexAuthorityState.enabled !== true
      || !chatAtlasCompleteIndexAuthorityActive()
      || index?.proof !== 'host-payload-full-graph'
      || !intent
    ) {
      if (selectedPathAcquisitionState.token && !intent) {
        chatAtlasClearSelectedPathAcquisition('trusted-intent-unavailable', { preserveGraph: true });
      }
      return getSelectedPathAcquisitionStatus();
    }
    const currentIntent = chatAtlasCurrentTrustedNativeBranchSelection(intent.qId);
    const scopeCurrent = currentIntent?.token === intent.token
      && intent.chatId === completeTurnIndexAuthorityState.chatId
      && intent.routeKey === completeTurnIndexAuthorityState.routeKey
      && intent.generation === Number(completeTurnIndexAuthorityState.generation || 0)
      && completeTurnIndexAuthorityState.branchSelectionStale === true
      && intent.qId === completeTurnIndexAuthorityState.branchSelectionStaleQId
      && intent.staleRevision === Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0);
    if (!scopeCurrent) {
      if (selectedPathAcquisitionState.token) {
        chatAtlasClearSelectedPathAcquisition('selected-path-ownership-changed', { preserveGraph: true });
      }
      return getSelectedPathAcquisitionStatus();
    }
    const evidence = chatAtlasSelectedPathNativeEvidence(members);
    const anchorEvidence = evidence.get(intent.qId);
    if (!anchorEvidence || anchorEvidence.memberCount !== 1) {
      return chatAtlasSelectedPathFail(
        anchorEvidence ? 'anchor-member-ambiguous' : 'anchor-member-missing',
        intent,
      );
    }
    if (anchorEvidence.answerIds.size !== 1) {
      return chatAtlasSelectedPathFail('anchor-answer-ambiguous', intent);
    }
    const selectedAnswerId = Array.from(anchorEvidence.answerIds)[0];
    const canonicalMatches = index.turns.filter((turn) => turn?.qId === intent.qId);
    if (canonicalMatches.length !== 1) {
      return chatAtlasSelectedPathFail('anchor-canonical-invalid', intent, selectedAnswerId);
    }
    const canonical = canonicalMatches[0];
    if (intent.priorAnswerId && selectedAnswerId === intent.priorAnswerId) {
      return chatAtlasSelectedPathFail('selected-answer-not-changed', intent, selectedAnswerId);
    }
    if (
      !selectedAnswerId
      || selectedAnswerId === canonical.primaryAId
      || !canonical.answerVariants.includes(selectedAnswerId)
    ) {
      return chatAtlasSelectedPathFail(
        selectedAnswerId === canonical.primaryAId
          ? 'selected-answer-is-canonical'
          : 'anchor-answer-not-canonical-variant',
        intent,
        selectedAnswerId,
      );
    }
    const retained = selectedPathAcquisitionState.graph;
    const graphCurrent = retained
      && retained.chatId === intent.chatId
      && retained.routeKey === intent.routeKey
      && retained.generation === intent.generation;
    const evaluationKey = JSON.stringify([
      intent.token,
      index.sourceFingerprint,
      Number(chatAtlasLedgerState.version || 0),
      graphCurrent ? retained.captureIdentity : '',
    ]);
    if (
      selectedPathAcquisitionState.evaluationKey === evaluationKey
      && ['proven', 'failed'].includes(selectedPathAcquisitionState.status)
    ) return getSelectedPathAcquisitionStatus();
    selectedPathAcquisitionState.origin = 'manual-native-selection';
    selectedPathAcquisitionState.token = intent.token;
    selectedPathAcquisitionState.anchorQId = intent.qId;
    selectedPathAcquisitionState.anchorSelectedAId = selectedAnswerId;
    selectedPathAcquisitionState.priorAnswerId = intent.priorAnswerId || null;
    selectedPathAcquisitionState.chatId = intent.chatId;
    selectedPathAcquisitionState.routeKey = intent.routeKey;
    selectedPathAcquisitionState.generation = intent.generation;
    selectedPathAcquisitionState.staleRevision = intent.staleRevision;
    selectedPathAcquisitionState.evaluatedLedgerVersion = Number(chatAtlasLedgerState.version || 0);
    selectedPathAcquisitionState.evaluationKey = evaluationKey;
    if (
      !graphCurrent
      || !chatAtlasSelectedPathGraphAnchorNode(retained.identityGraph, selectedAnswerId)
    ) {
      if (selectedPathAcquisitionState.refetchAttemptedForToken === intent.token) {
        return chatAtlasSelectedPathFail('anchor-not-in-graph', intent, selectedAnswerId);
      }
      void chatAtlasSelectedPathRefetch(intent);
      return getSelectedPathAcquisitionStatus();
    }
    const transaction = chatAtlasBranchTransactionCurrent();
    if (transaction?.state === 'pending' && transaction.token === intent.token) {
      transaction.graphCaptureIdentity = String(retained.captureIdentity || '');
      transaction.graphEvaluationKey = JSON.stringify([
        transaction.token,
        transaction.graphCaptureIdentity,
        selectedAnswerId,
      ]);
    }
    // Native client selected chain first. It is the only evidence that follows
    // a manual switch immediately; the graph still validates every entry.
    const clientChain = chatAtlasNativeClientSelectedChain(retained.identityGraph, selectedAnswerId);
    const clientProves = chatAtlasClientChainProvesAnchor(clientChain, selectedAnswerId);
    if (clientProves) {
      chatAtlasBranchTransactionTrace('acq-client-chain', { count: clientChain.messageIds.length });
    }
    const derived = chatAtlasDeriveSelectedPath(
      retained.identityGraph,
      Object.freeze({
        ...intent,
        mountedEvidence: evidence,
        clientSelectedChainClosure: clientProves ? clientChain.closure : null,
        clientSelectedChain: clientProves ? clientChain : null,
      }),
      selectedAnswerId,
    );
    if (!derived.ok) {
      // Derivation is not allowed to reach a terminal verdict against a graph
      // that is known to be pre-click for THIS trusted selection. Keep the
      // transaction open and hand off to the one bounded host refresh, then
      // re-derive against the refreshed current_node chain.
      if (
        !clientProves
        && chatAtlasSelectedPathStaleGraphEvidence(
          retained.identityGraph,
          selectedAnswerId,
          derived.reason,
        )
      ) {
        // Refresh already in flight for this exact selection: stay pending
        // rather than racing it to a failure it is about to make obsolete.
        if (selectedPathAcquisitionState.refetchActiveForToken === intent.token) {
          return getSelectedPathAcquisitionStatus();
        }
        if (selectedPathAcquisitionState.refetchAttemptedForToken !== intent.token) {
          chatAtlasBranchTransactionTrace('acq-graph-pending', { reason: derived.reason });
          selectedPathAcquisitionState.status = 'inactive';
          selectedPathAcquisitionState.reason = 'branch-transaction-graph-pending';
          void chatAtlasSelectedPathRefetch(intent);
          return getSelectedPathAcquisitionStatus();
        }
        // The one bounded refresh is spent. Refreshed evidence is the best
        // this selection will ever get, so the verdict is now genuine.
      }
      return chatAtlasSelectedPathFail(derived.reason, intent, selectedAnswerId);
    }
    if (!chatAtlasSelectedPathProofValid(derived)) {
      return chatAtlasSelectedPathFail('proof-ownership-invalid', intent, selectedAnswerId);
    }
    chatAtlasBranchTransactionTrace('acq-proven', { count: derived.path.length });
    selectedPathAcquisitionState.status = 'proven';
    selectedPathAcquisitionState.reason = 'selected-path-proven';
    selectedPathAcquisitionState.path = derived.path;
    selectedPathAcquisitionState.proof = derived.proof;
    selectedPathAcquisitionState.provenAt = new Date().toISOString();
    if (typeof chatAtlasSelectedPathOverlayEvaluate === 'function') {
      chatAtlasSelectedPathOverlayEvaluate();
    }
    return getSelectedPathAcquisitionStatus();
  }

  function chatAtlasBranchSelectionStaleCheckpoint() {
    if (completeTurnIndexAuthorityState.branchSelectionStale !== true) return null;
    const qId = String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '');
    const primaryAId = String(getRecordByQIdInternal(qId)?.primaryAId || '');
    return Object.freeze({
      revision: Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0),
      qId,
      primaryAId,
      chatId: String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || ''),
      routeKey: String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || ''),
      generation: Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0),
    });
  }

  function chatAtlasBranchSelectionStaleReconciled(checkpoint) {
    const qId = normalizeTurnAlias(checkpoint?.qId || '');
    const priorPrimaryAId = normalizeTurnAlias(checkpoint?.primaryAId || '');
    if (!qId || !priorPrimaryAId) return false;
    const record = getRecordByQIdInternal(qId);
    const recordQId = normalizeTurnAlias(record?.qId || '');
    const refreshedPrimaryAId = normalizeTurnAlias(record?.primaryAId || '');
    return recordQId === qId
      && !!refreshedPrimaryAId
      && refreshedPrimaryAId !== priorPrimaryAId;
  }

  const CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS = 8000;
  const CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS = Object.freeze([
    250,
    750,
    1750,
  ]);

  function chatAtlasBranchExpansionRequiredPageNums(priorCountRaw, targetCountRaw) {
    const priorCount = Math.max(0, Number(priorCountRaw || 0) || 0);
    const targetCount = Math.max(0, Number(targetCountRaw || 0) || 0);
    const priorPageCount = priorCount > 0 ? Math.ceil(priorCount / CHAT_ATLAS_PAGE_SIZE) : 0;
    const targetPageCount = targetCount > 0 ? Math.ceil(targetCount / CHAT_ATLAS_PAGE_SIZE) : 0;
    const pages = [];
    for (let pageNum = priorPageCount + 1; pageNum <= targetPageCount; pageNum += 1) {
      pages.push(pageNum);
    }
    return Object.freeze(pages);
  }

  function chatAtlasBranchReturnPathMembers(path = []) {
    if (!Array.isArray(path) || !path.length) return Object.freeze([]);
    return Object.freeze(path.map((turn) => Object.freeze({
      order: Number(turn?.order || 0),
      qId: chatAtlasCompleteIndexIdentity(turn?.qId),
      primaryAId: turn?.primaryAId == null
        ? null
        : chatAtlasCompleteIndexIdentity(turn.primaryAId),
      noAnswer: turn?.noAnswer === true,
    })));
  }

  function chatAtlasBranchReturnPathIdentity(members = []) {
    if (!Array.isArray(members) || !members.length) return '';
    return `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(members.map((turn) => [
      Number(turn?.order || 0),
      String(turn?.qId || ''),
      turn?.primaryAId == null ? null : String(turn.primaryAId || ''),
      turn?.noAnswer === true,
    ])))}`;
  }

  function chatAtlasCaptureBranchReturnCandidate(context = {}, priorIndex = null) {
    const invalid = (reason, detail = {}) => Object.freeze({
      classification: 'invalid',
      reason: chatAtlasCompleteIndexCode(reason, 'capture-candidate-invalid', 64),
      targetVariantAnswerId: String(detail.targetVariantAnswerId || ''),
      graphCaptureIdentity: String(detail.graphCaptureIdentity || ''),
      graphCapturedAt: String(detail.graphCapturedAt || ''),
      derivedTargetCount: 0,
      derivedPathIdentity: '',
      derivedPathMembers: Object.freeze([]),
      priorPresentationSource: String(context?.priorPresentationSource || ''),
    });
    const qId = chatAtlasCompleteIndexIdentity(context?.qId);
    const priorAnswerId = chatAtlasCompleteIndexIdentity(context?.priorAnswerId);
    const direction = String(context?.direction || '');
    // A trusted click whose exact native sibling order is not yet provable is
    // NOT a failed capture. The click itself — qId, prior answer, direction and
    // the trusted transaction scope — is fully proven; only the identity of the
    // answer the pager moved to is still unknown, and it is resolved exactly
    // once at the retained-graph publication handoff. Nothing is ever guessed
    // from turn.answerVariants, which is presentation-ordered and moves
    // primaryAId last, so index ±1 on it is not a pager position at all.
    const deferred = (reason) => Object.freeze({
      classification: 'pending',
      reason: chatAtlasCompleteIndexCode(reason, 'capture-return-target-pending', 64),
      qId,
      priorAnswerId,
      direction,
      targetResolved: false,
      targetVariantAnswerId: '',
      graphCaptureIdentity: '',
      graphCapturedAt: '',
      derivedTargetCount: 0,
      derivedPathIdentity: '',
      derivedPathMembers: Object.freeze([]),
      priorPresentationSource: String(context?.priorPresentationSource || ''),
    });
    const turns = Array.isArray(priorIndex?.turns) ? priorIndex.turns : [];
    const priorCount = Number(context?.priorEffectiveCount || 0);
    const priorFingerprint = String(context?.priorEffectiveFingerprint || '');
    if (!qId || !priorAnswerId || !['previous', 'next'].includes(direction)) {
      return invalid(!['previous', 'next'].includes(direction)
        ? 'capture-direction-invalid'
        : 'capture-anchor-invalid');
    }
    if (
      !Number.isInteger(priorCount)
      || priorCount < 1
      || turns.length !== priorCount
      || !priorFingerprint
      || String(priorIndex?.sourceFingerprint || '') !== priorFingerprint
      || chatAtlasCompleteIndexFingerprint(turns) !== priorFingerprint
    ) return invalid('capture-prior-presentation-invalid');
    const anchors = turns.filter((turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === qId);
    if (anchors.length !== 1 || !Array.isArray(anchors[0]?.answerVariants)) {
      return invalid(anchors.length > 1 ? 'capture-anchor-ambiguous' : 'capture-anchor-invalid');
    }
    const variants = anchors[0].answerVariants.map(chatAtlasCompleteIndexIdentity);
    if (
      variants.some((answerId) => !answerId)
      || new Set(variants).size !== variants.length
    ) return invalid('capture-answer-variants-malformed');
    const priorMatches = variants.reduce(
      (count, answerId) => count + (answerId === priorAnswerId ? 1 : 0),
      0,
    );
    if (priorMatches !== 1) {
      return invalid(priorMatches > 1
        ? 'capture-prior-answer-ambiguous'
        : 'capture-prior-answer-absent');
    }
    // Retained-graph scope is the trustworthiness gate for native sibling
    // order, so it is proven BEFORE any adjacency is attempted. The two
    // outcomes are deliberately different: a retained graph that is simply
    // ABSENT is deferrable evidence unavailability, while a retained graph
    // that exists but is out of scope or invalid is a containment failure and
    // stays terminal — it must never gain return ownership.
    const retained = selectedPathAcquisitionState.graph;
    const graph = retained?.identityGraph || null;
    if (!retained || !Array.isArray(graph?.nodes) || !graph.nodes.length) {
      return deferred('capture-native-order-deferred');
    }
    const graphCaptureIdentity = String(retained.captureIdentity || '');
    if (
      !graphCaptureIdentity
      || retained.chatId !== String(context?.chatId || '')
      || retained.routeKey !== String(context?.routeKey || '')
      || Number(retained.generation || 0) !== Number(context?.generation || 0)
      || !chatAtlasIdentityGraphValid(graph, context?.chatId)
    ) return invalid('capture-graph-scope-invalid');
    // Adjacency is resolved against the host's NATIVE sibling order, never
    // against the presentation-ordered variant list above. The checks on
    // `variants` remain as the canonical well-formedness precondition.
    const resolvedTarget = chatAtlasResolveNativeReturnTarget(
      graph,
      qId,
      priorAnswerId,
      direction,
    );
    if (resolvedTarget.ok !== true) return invalid(resolvedTarget.reason);
    const targetVariantAnswerId = resolvedTarget.targetVariantAnswerId;
    const canonical = chatAtlasCanonicalPresentationIndex();
    if (
      !canonical
      || canonical.turns.length !== priorCount
      || String(canonical.sourceFingerprint || '') !== priorFingerprint
    ) return invalid('capture-prior-authority-mismatch', {
      targetVariantAnswerId,
      graphCaptureIdentity,
      graphCapturedAt: graph?.capturedAt,
    });
    const derived = chatAtlasDeriveSelectedPath(
      graph,
      Object.freeze({
        token: String(context?.token || ''),
        qId,
        chatId: String(context?.chatId || ''),
        routeKey: String(context?.routeKey || ''),
        generation: Number(context?.generation || 0),
        staleRevision: Number(context?.staleRevision || 0),
      }),
      targetVariantAnswerId,
    );
    if (!derived?.ok) return invalid(`capture-${derived?.reason || 'derivation-failed'}`, {
      targetVariantAnswerId,
      graphCaptureIdentity,
      graphCapturedAt: graph?.capturedAt,
    });
    const derivedPathMembers = chatAtlasBranchReturnPathMembers(derived.path);
    const derivedPathIdentity = chatAtlasBranchReturnPathIdentity(derivedPathMembers);
    const derivedTargetCount = derivedPathMembers.length;
    const expanding = derivedTargetCount > priorCount;
    return Object.freeze({
      classification: expanding ? 'expanding' : 'not-expanding',
      reason: expanding
        ? 'graph-derived-expanding-return'
        : (derivedTargetCount === priorCount
          ? 'graph-derived-equal-return'
          : 'graph-derived-contracting-return'),
      targetVariantAnswerId,
      graphCaptureIdentity,
      graphCapturedAt: String(graph?.capturedAt || ''),
      derivedTargetCount,
      derivedPathIdentity,
      derivedPathMembers,
      priorPresentationSource: String(context?.priorPresentationSource || ''),
    });
  }

  function chatAtlasGraphReturnCandidateScopeCurrent(intent, candidate, options = {}) {
    const route = chatAtlasFullIndexRoute();
    const retained = selectedPathAcquisitionState.graph;
    const effective = getEffectivePresentationIndex();
    const priorCount = Number(intent?.priorEffectiveCount || 0);
    const priorFingerprint = String(intent?.priorEffectiveFingerprint || '');
    const effectiveFingerprint = String(effective?.sourceFingerprint || '');
    const pathMembers = candidate?.derivedPathMembers;
    const effectivePriorCurrent = Array.isArray(effective?.turns)
      && effective.turns.length === priorCount
      && effectiveFingerprint === priorFingerprint
      && chatAtlasCompleteIndexFingerprint(effective.turns) === priorFingerprint;
    const retainedOverlayCurrent = selectedPathOverlayState.status === 'active'
      && selectedPathOverlayState.token === String(intent?.token || '')
      && selectedPathOverlayState.anchorQId === String(intent?.qId || '')
      && selectedPathOverlayState.chatId === String(intent?.chatId || '')
      && selectedPathOverlayState.routeKey === String(intent?.routeKey || '')
      && Number(selectedPathOverlayState.generation || 0) === Number(intent?.generation || 0)
      && Number(selectedPathOverlayState.staleRevision || 0) === Number(intent?.staleRevision || 0)
      && Array.isArray(selectedPathOverlayState.index?.turns)
      && selectedPathOverlayState.index.turns.length === priorCount
      && String(selectedPathOverlayState.index?.sourceFingerprint || '') === priorFingerprint
      && chatAtlasCompleteIndexFingerprint(selectedPathOverlayState.index.turns) === priorFingerprint;
    return candidate?.classification === 'expanding'
      && !!chatAtlasCompleteIndexIdentity(candidate?.targetVariantAnswerId)
      && !!String(candidate?.graphCaptureIdentity || '')
      && Number(candidate?.derivedTargetCount || 0) > priorCount
      && Array.isArray(pathMembers)
      && pathMembers.length === Number(candidate?.derivedTargetCount || 0)
      && String(candidate?.derivedPathIdentity || '')
        === chatAtlasBranchReturnPathIdentity(pathMembers)
      && intent?.chatId === String(completeTurnIndexAuthorityState.chatId || '')
      && intent?.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
      && Number(intent?.generation || 0) === Number(completeTurnIndexAuthorityState.generation || 0)
      && Number(intent?.staleRevision || 0)
        === Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      && intent?.qId === String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '')
      && intent?.chatId === String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '')
      && intent?.routeKey === String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '')
      && Number(intent?.generation || 0)
        === Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0)
      && intent?.chatId === String(route?.chatId || '')
      && intent?.routeKey === String(route?.routeKey || '')
      && Number.isInteger(priorCount)
      && priorCount > 0
      && !!priorFingerprint
      && (effectivePriorCurrent || (options.allowTargetArrival === true && (
        retainedOverlayCurrent
        || ['selected-path-overlay', 'retained-selected-path-graph']
          .includes(String(candidate?.priorPresentationSource || ''))
      )))
      && retained?.chatId === intent?.chatId
      && retained?.routeKey === intent?.routeKey
      && Number(retained?.generation || 0) === Number(intent?.generation || 0)
      && String(retained?.captureIdentity || '') === String(candidate?.graphCaptureIdentity || '')
      && chatAtlasIdentityGraphValid(retained?.identityGraph, intent?.chatId);
  }

  function chatAtlasPreExpansionCanonicalReturnWindow(intentRaw = null) {
    const intent = intentRaw || completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const token = String(intent?.token || '');
    const qId = chatAtlasCompleteIndexIdentity(intent?.qId);
    const priorCount = Number(intent?.priorEffectiveCount || 0);
    const priorFingerprint = String(intent?.priorEffectiveFingerprint || '');
    const candidate = intent?.returnTargetCandidate || null;
    const active = !!intent
      && completeTurnIndexAuthorityState.trustedSelectedPathIntent === intent
      && completeTurnIndexAuthorityState.enabled === true
      && completeTurnIndexAuthorityState.branchSelectionStale === true
      && !!token
      && !!qId
      && chatAtlasGraphReturnCandidateScopeCurrent(intent, candidate);
    return Object.freeze({
      active,
      token: active ? token : '',
      qId: active ? qId : '',
      chatId: active ? intent.chatId : '',
      routeKey: active ? intent.routeKey : '',
      generation: active ? Number(intent.generation || 0) : 0,
      staleRevision: active ? Number(intent.staleRevision || 0) : 0,
      priorCount: active ? priorCount : 0,
      priorFingerprint: active ? priorFingerprint : '',
      targetVariantAnswerId: active ? String(candidate.targetVariantAnswerId || '') : '',
      graphCaptureIdentity: active ? String(candidate.graphCaptureIdentity || '') : '',
      graphCapturedAt: active ? String(candidate.graphCapturedAt || '') : '',
      graphDerivedTargetCount: active ? Number(candidate.derivedTargetCount || 0) : 0,
      graphDerivedPathIdentity: active ? String(candidate.derivedPathIdentity || '') : '',
      graphDerivedPathMembers: active
        ? candidate.derivedPathMembers
        : Object.freeze([]),
    });
  }

  function chatAtlasRealBranchExpansionTargetValidation(intent, targetIndex, candidateRaw = null) {
    const fail = (reason, detail = {}) => Object.freeze({
      ok: false,
      reason: chatAtlasCompleteIndexCode(reason, 'branch-return-target-invalid', 64),
      targetAvailable: detail.targetAvailable === true,
      targetCount: Number(detail.targetCount || 0),
      targetFingerprint: String(detail.targetFingerprint || ''),
      requiredPageNums: Object.freeze(Array.from(detail.requiredPageNums || [])),
    });
    const candidate = candidateRaw || intent?.returnTargetCandidate || null;
    if (!chatAtlasGraphReturnCandidateScopeCurrent(intent, candidate, { allowTargetArrival: true })) {
      return fail('branch-return-candidate-stale');
    }
    const turns = Array.isArray(targetIndex?.turns) ? targetIndex.turns : [];
    const priorCount = Number(intent?.priorEffectiveCount || 0);
    const targetCount = turns.length;
    const targetFingerprint = String(targetIndex?.sourceFingerprint || '');
    const targetAvailable = targetIndex?.complete === true
      && targetIndex?.proof === 'host-payload-full-graph'
      && targetCount > priorCount
      && !!targetFingerprint
      && chatAtlasCompleteIndexFingerprint(turns) === targetFingerprint;
    if (!targetAvailable) return fail('branch-return-target-unavailable');
    const targetDetail = {
      targetAvailable: true,
      targetCount,
      targetFingerprint,
      requiredPageNums: chatAtlasBranchExpansionRequiredPageNums(priorCount, targetCount),
    };
    if (chatAtlasCompleteIndexIdentity(targetIndex?.chatId) !== chatAtlasCompleteIndexIdentity(intent?.chatId)) {
      return fail('branch-return-target-chat-mismatch', targetDetail);
    }
    const anchors = turns.filter((turn) => (
      chatAtlasCompleteIndexIdentity(turn?.qId) === chatAtlasCompleteIndexIdentity(intent?.qId)
    ));
    if (
      anchors.length !== 1
      || chatAtlasCompleteIndexIdentity(anchors[0]?.primaryAId)
        !== chatAtlasCompleteIndexIdentity(candidate?.targetVariantAnswerId)
    ) return fail('branch-return-target-answer-mismatch', targetDetail);
    const targetMembers = chatAtlasBranchReturnPathMembers(turns);
    if (
      targetMembers.length !== Number(candidate?.derivedTargetCount || 0)
      || chatAtlasBranchReturnPathIdentity(targetMembers)
        !== String(candidate?.derivedPathIdentity || '')
    ) return fail('branch-return-target-path-mismatch', targetDetail);
    return Object.freeze({
      ok: true,
      reason: 'branch-return-target-proven',
      targetAvailable: true,
      targetCount,
      targetFingerprint,
      requiredPageNums: targetDetail.requiredPageNums,
    });
  }

  function chatAtlasBranchExpansionFailureRecord(scope, reasonRaw, retainsSelectedPathOverlay = false) {
    const reason = chatAtlasCompleteIndexCode(reasonRaw, 'fail-closed', 64);
    const targetResolved = scope?.targetResolved !== false;
    const graphDerivedPathMembers = chatAtlasBranchReturnPathMembers(
      scope?.graphDerivedPathMembers || [],
    );
    return Object.freeze({
      key: String(scope?.key || ''),
      token: String(scope?.token || ''),
      qId: String(scope?.qId || ''),
      chatId: String(scope?.chatId || ''),
      routeKey: String(scope?.routeKey || ''),
      generation: Number(scope?.generation || 0),
      staleRevision: Number(scope?.staleRevision || 0),
      priorCount: Number(scope?.priorCount || 0),
      priorFingerprint: String(scope?.priorFingerprint || ''),
      targetResolved,
      targetCount: targetResolved ? Number(scope?.targetCount || 0) : 0,
      expectedFingerprint: targetResolved
        ? String(scope?.expectedFingerprint || scope?.targetFingerprint || '')
        : '',
      requiredPageNums: targetResolved
        ? Object.freeze(Array.from(scope?.requiredPageNums || []))
        : Object.freeze([]),
      graphCaptureIdentity: String(scope?.graphCaptureIdentity || ''),
      targetVariantAnswerId: String(scope?.targetVariantAnswerId || ''),
      graphDerivedTargetCount: Number(scope?.graphDerivedTargetCount || 0),
      graphDerivedPathIdentity: String(scope?.graphDerivedPathIdentity || ''),
      graphDerivedPathMembers,
      retainsSelectedPathOverlay: retainsSelectedPathOverlay === true,
      reason,
      completedAt: Date.now(),
    });
  }

  function chatAtlasClearBranchExpansionTimers() {
    if (completeTurnIndexAuthorityState.branchExpansionTimeoutTask != null) {
      try { (W.clearTimeout || clearTimeout)(completeTurnIndexAuthorityState.branchExpansionTimeoutTask); } catch {}
      completeTurnIndexAuthorityState.branchExpansionTimeoutTask = null;
    }
    if (completeTurnIndexAuthorityState.branchExpansionRetryTask != null) {
      try { (W.clearTimeout || clearTimeout)(completeTurnIndexAuthorityState.branchExpansionRetryTask); } catch {}
      completeTurnIndexAuthorityState.branchExpansionRetryTask = null;
    }
  }

  function chatAtlasResetBranchExpansionLifecycle(reason = 'expansion-reset') {
    chatAtlasClearBranchExpansionTimers();
    completeTurnIndexAuthorityState.branchExpansionLease = null;
    completeTurnIndexAuthorityState.branchExpansionFailure = null;
    completeTurnIndexAuthorityState.branchExpansionState = 'idle';
    completeTurnIndexAuthorityState.branchExpansionReason = chatAtlasCompleteIndexCode(reason, 'expansion-reset', 64);
    completeTurnIndexAuthorityState.branchExpansionAnchorReturned = false;
    completeTurnIndexAuthorityState.branchExpansionPriorCount = 0;
    completeTurnIndexAuthorityState.branchExpansionPriorFingerprint = '';
    completeTurnIndexAuthorityState.branchExpansionTargetCount = 0;
    completeTurnIndexAuthorityState.branchExpansionExpectedFingerprint = '';
    completeTurnIndexAuthorityState.branchExpansionRequiredPageNums = Object.freeze([]);
  }

  function chatAtlasBranchExpansionLeaseCurrent(leaseRaw = null, options = {}) {
    const lease = leaseRaw || completeTurnIndexAuthorityState.branchExpansionLease;
    if (!lease || completeTurnIndexAuthorityState.branchExpansionLease !== lease) return false;
    const route = chatAtlasFullIndexRoute();
    return completeTurnIndexAuthorityState.branchExpansionState === 'pending'
      && lease.chatId === String(completeTurnIndexAuthorityState.chatId || '')
      && lease.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
      && lease.generation === Number(completeTurnIndexAuthorityState.generation || 0)
      && lease.staleRevision === Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      && lease.chatId === String(route?.chatId || '')
      && lease.routeKey === String(route?.routeKey || '')
      && (options.allowExpired === true || Date.now() <= Number(lease.deadlineAt || 0));
  }

  function chatAtlasClearTrustedIntentForExpansion(reason, token = '') {
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    if (!intent || (token && intent.token !== token)) return false;
    completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
    if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
      chatAtlasClearSelectedPathAcquisition(reason, { preserveGraph: true });
    }
    chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
      reason,
      qId: intent.qId,
      token: intent.token,
    });
    return true;
  }

  function chatAtlasFailClosedPreExpansionReturn(intent, windowState, reasonRaw = '', options = {}) {
    let currentWindow = chatAtlasPreExpansionCanonicalReturnWindow(intent);
    const candidate = intent?.returnTargetCandidate || null;
    if (
      currentWindow.active !== true
      && options.allowTargetArrival === true
      && chatAtlasGraphReturnCandidateScopeCurrent(intent, candidate, { allowTargetArrival: true })
    ) {
      currentWindow = Object.freeze({
        active: true,
        token: String(intent?.token || ''),
        qId: chatAtlasCompleteIndexIdentity(intent?.qId),
        chatId: String(intent?.chatId || ''),
        routeKey: String(intent?.routeKey || ''),
        generation: Number(intent?.generation || 0),
        staleRevision: Number(intent?.staleRevision || 0),
        priorCount: Number(intent?.priorEffectiveCount || 0),
        priorFingerprint: String(intent?.priorEffectiveFingerprint || ''),
        targetVariantAnswerId: String(candidate?.targetVariantAnswerId || ''),
        graphCaptureIdentity: String(candidate?.graphCaptureIdentity || ''),
        graphCapturedAt: String(candidate?.graphCapturedAt || ''),
        graphDerivedTargetCount: Number(candidate?.derivedTargetCount || 0),
        graphDerivedPathIdentity: String(candidate?.derivedPathIdentity || ''),
        graphDerivedPathMembers: candidate?.derivedPathMembers || Object.freeze([]),
      });
    }
    const expectedWindow = windowState?.active === true ? windowState : currentWindow;
    if (
      currentWindow.active !== true
      || expectedWindow?.active !== true
      || currentWindow.token !== expectedWindow.token
      || currentWindow.qId !== expectedWindow.qId
      || currentWindow.staleRevision !== Number(expectedWindow.staleRevision || 0)
      || currentWindow.priorFingerprint !== String(expectedWindow.priorFingerprint || '')
      || currentWindow.graphCaptureIdentity !== String(expectedWindow.graphCaptureIdentity || '')
      || currentWindow.targetVariantAnswerId !== String(expectedWindow.targetVariantAnswerId || '')
      || currentWindow.graphDerivedPathIdentity !== String(expectedWindow.graphDerivedPathIdentity || '')
      || completeTurnIndexAuthorityState.branchExpansionLease
    ) return false;
    const targetIndex = chatAtlasCanonicalPresentationIndex();
    const realTarget = chatAtlasRealBranchExpansionTargetValidation(intent, targetIndex, candidate);
    const targetResolved = realTarget.targetAvailable === true;
    const reason = chatAtlasCompleteIndexCode(
      reasonRaw || (targetResolved
        ? (realTarget.ok
          ? 'pre-expansion-return-window-exceeded'
          : 'pre-expansion-return-target-mismatch')
        : 'pre-expansion-return-target-unresolved'),
      targetResolved
        ? 'pre-expansion-return-window-exceeded'
        : 'pre-expansion-return-target-unresolved',
      64,
    );
    chatAtlasClearBranchExpansionTimers();
    completeTurnIndexAuthorityState.branchExpansionSequence += 1;
    const key = `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
      currentWindow.chatId,
      currentWindow.routeKey,
      currentWindow.generation,
      currentWindow.staleRevision,
      currentWindow.token,
      currentWindow.qId,
      currentWindow.priorCount,
      currentWindow.priorFingerprint,
      currentWindow.graphCaptureIdentity,
      currentWindow.targetVariantAnswerId,
      currentWindow.graphDerivedTargetCount,
      currentWindow.graphDerivedPathIdentity,
      targetResolved ? realTarget.targetCount : null,
      targetResolved ? realTarget.targetFingerprint : null,
      completeTurnIndexAuthorityState.branchExpansionSequence,
    ]))}`;
    const failure = chatAtlasBranchExpansionFailureRecord({
      ...currentWindow,
      key,
      targetResolved,
      targetCount: targetResolved ? realTarget.targetCount : 0,
      expectedFingerprint: targetResolved ? realTarget.targetFingerprint : '',
      requiredPageNums: targetResolved ? realTarget.requiredPageNums : Object.freeze([]),
    }, reason, true);
    completeTurnIndexAuthorityState.branchExpansionLease = null;
    completeTurnIndexAuthorityState.branchExpansionState = 'fail-closed';
    completeTurnIndexAuthorityState.branchExpansionReason = reason;
    completeTurnIndexAuthorityState.branchExpansionFailure = failure;
    completeTurnIndexAuthorityState.branchExpansionAnchorReturned = false;
    completeTurnIndexAuthorityState.branchExpansionPriorCount = currentWindow.priorCount;
    completeTurnIndexAuthorityState.branchExpansionPriorFingerprint = currentWindow.priorFingerprint;
    completeTurnIndexAuthorityState.branchExpansionTargetCount = targetResolved
      ? realTarget.targetCount
      : 0;
    completeTurnIndexAuthorityState.branchExpansionExpectedFingerprint = targetResolved
      ? realTarget.targetFingerprint
      : '';
    completeTurnIndexAuthorityState.branchExpansionRequiredPageNums = targetResolved
      ? realTarget.requiredPageNums
      : Object.freeze([]);
    chatAtlasClearTrustedIntentForExpansion(`branch-expansion-${reason}`, currentWindow.token);
    chatAtlasTraceTrustedLifecycle('branch-expansion-fail-closed', {
      reason,
      priorCount: currentWindow.priorCount,
      targetCount: targetResolved ? realTarget.targetCount : 0,
      attempts: 0,
    });
    if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
    return true;
  }

  function chatAtlasBranchExpansionStaleCheckpoint(lease) {
    return Object.freeze({
      revision: Number(lease?.staleRevision || 0),
      qId: String(completeTurnIndexAuthorityState.branchSelectionStaleQId || ''),
      chatId: String(lease?.chatId || ''),
      routeKey: String(lease?.routeKey || ''),
      generation: Number(lease?.generation || 0),
    });
  }

  function chatAtlasFinishBranchExpansion(lease, outcome, reasonRaw) {
    if (!chatAtlasBranchExpansionLeaseCurrent(lease, { allowExpired: true })) return false;
    const outcomeCode = outcome === 'confirmed' ? 'confirmed' : 'fail-closed';
    const reason = chatAtlasCompleteIndexCode(reasonRaw, outcomeCode, 64);
    const summary = chatAtlasBranchExpansionFailureRecord(lease, reason);
    chatAtlasClearBranchExpansionTimers();
    completeTurnIndexAuthorityState.branchExpansionLease = null;
    completeTurnIndexAuthorityState.branchExpansionState = outcomeCode;
    chatAtlasCloseBranchTransaction(outcomeCode === 'confirmed' ? 'published' : 'fail-closed', `branch-expansion-${outcomeCode}`, String(lease.token || ''));
    completeTurnIndexAuthorityState.branchExpansionReason = reason;
    completeTurnIndexAuthorityState.branchExpansionFailure = outcomeCode === 'fail-closed' ? summary : null;
    const staleCheckpoint = chatAtlasBranchExpansionStaleCheckpoint(lease);
    chatAtlasClearBranchSelectionStale(staleCheckpoint, `branch-expansion-${reason}`, false);
    chatAtlasClearTrustedIntentForExpansion(`branch-expansion-${reason}`, lease.token);
    chatAtlasTraceTrustedLifecycle(`branch-expansion-${outcomeCode}`, {
      reason,
      priorCount: lease.priorCount,
      targetCount: lease.targetCount,
      attempts: lease.attemptCount,
    });
    if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
    return true;
  }

  function chatAtlasThreadPagesControllerApi() {
    const readRuntime = (runtime, source) => {
      try {
        const controller = runtime?.H2O?.ChatPageTitleIntent?.api || null;
        if (!controller) {
          return Object.freeze({ state: 'temporarily-unpublished', source, controller: null, resolve: null });
        }
        const resolve = controller?.resolveNativePageHeadCoherence;
        if (typeof resolve !== 'function') {
          return Object.freeze({ state: 'structurally-incomplete', source, controller, resolve: null });
        }
        return Object.freeze({ state: 'ready', source, controller, resolve });
      } catch {
        return Object.freeze({ state: 'runtime-access-failure', source, controller: null, resolve: null });
      }
    };
    let topWindow = null;
    try { topWindow = W?.top || W; } catch {}
    if (topWindow === W) return readRuntime(W, 'shared');
    if (topWindow) {
      const shared = readRuntime(topWindow, 'shared');
      if (shared.state === 'ready' || shared.state === 'structurally-incomplete') return shared;
      const local = readRuntime(W, 'local');
      if (local.state === 'ready' || local.state === 'structurally-incomplete') return local;
      return shared.state === 'runtime-access-failure' ? shared : local;
    }
    const local = readRuntime(W, 'local');
    return local.state === 'temporarily-unpublished'
      ? Object.freeze({ state: 'runtime-access-failure', source: 'shared', controller: null, resolve: null })
      : local;
  }

  function chatAtlasEvaluateNativePageHeadsForExpansion(lease) {
    if (!chatAtlasBranchExpansionLeaseCurrent(lease)) {
      return Object.freeze({ state: 'unavailable', reason: 'lease-stale', temporary: false, pages: Object.freeze([]) });
    }
    const lookup = chatAtlasThreadPagesControllerApi();
    if (lookup.state !== 'ready') {
      const temporary = lookup.state === 'temporarily-unpublished' || lookup.state === 'runtime-access-failure';
      return Object.freeze({
        state: 'unavailable',
        reason: lookup.state === 'runtime-access-failure'
          ? 'controller-runtime-access-failure'
          : (temporary ? 'controller-initializing' : 'controller-unavailable'),
        temporary,
        pages: Object.freeze([]),
      });
    }
    const { controller, resolve } = lookup;
    const pages = [];
    let state = 'match';
    let reason = 'all-required-page-heads-match';
    let temporary = false;
    for (const pageNum of lease.requiredPageNums) {
      let result = null;
      try {
        result = resolve.call(controller, pageNum) || null;
      } catch {
        try {
          chatAtlasTraceTrustedLifecycle('branch-expansion-controller-exception', {
            subsystem: 'thread-pages-controller',
            operation: 'resolve-native-page-head-coherence',
            phase: 'branch-expansion-confirmation',
            category: 'exception',
          });
        } catch {}
        pages.push(Object.freeze({ pageNum, state: 'unavailable' }));
        state = 'unavailable';
        reason = 'native-page-head-controller-exception';
        temporary = true;
        break;
      }
      const pageState = String(result?.state || 'unavailable');
      pages.push(Object.freeze({ pageNum, state: pageState }));
      if (pageState === 'conflict') {
        state = 'conflict';
        reason = 'native-page-head-conflict';
        break;
      }
      if (pageState === 'unavailable' && state !== 'conflict') {
        state = 'unavailable';
        reason = 'native-page-head-unavailable';
      } else if (pageState === 'absent' && state === 'match') {
        state = 'absent';
        reason = 'native-page-head-absent';
      } else if (pageState !== 'match' && !['absent', 'unavailable'].includes(pageState)) {
        state = 'unavailable';
        reason = 'native-page-head-invalid';
      }
    }
    return Object.freeze({ state, reason, temporary, pages: Object.freeze(pages) });
  }

  function chatAtlasScheduleBranchExpansionConvergence(lease, exhaustedReason = 'attempts-exhausted') {
    if (!chatAtlasBranchExpansionLeaseCurrent(lease)) return false;
    if (completeTurnIndexAuthorityState.branchExpansionRetryTask != null) return true;
    if (lease.attemptCount >= CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS.length) {
      return chatAtlasFinishBranchExpansion(lease, 'fail-closed', exhaustedReason);
    }
    const delay = CHAT_ATLAS_BRANCH_EXPANSION_DELAYS_MS[lease.attemptCount];
    if ((Date.now() + delay) > lease.deadlineAt) {
      return chatAtlasFinishBranchExpansion(lease, 'fail-closed', 'timeout');
    }
    const key = lease.key;
    completeTurnIndexAuthorityState.branchExpansionRetryTask = (W.setTimeout || setTimeout)(() => {
      completeTurnIndexAuthorityState.branchExpansionRetryTask = null;
      const current = completeTurnIndexAuthorityState.branchExpansionLease;
      if (!current || current.key !== key || !chatAtlasBranchExpansionLeaseCurrent(current)) return;
      current.attemptCount += 1;
      Promise.resolve(refreshCompleteTurnIndexProjection('branch-expansion-convergence')).catch(() => {
        const latest = completeTurnIndexAuthorityState.branchExpansionLease;
        if (latest?.key === key) chatAtlasFinishBranchExpansion(latest, 'fail-closed', 'refresh-failed');
      });
    }, delay);
    return true;
  }

  function chatAtlasEnsureBranchExpansionTimeout(lease) {
    if (!chatAtlasBranchExpansionLeaseCurrent(lease)) return false;
    if (completeTurnIndexAuthorityState.branchExpansionTimeoutTask != null) return true;
    const key = lease.key;
    const delay = Math.max(0, Number(lease.deadlineAt || 0) - Date.now());
    completeTurnIndexAuthorityState.branchExpansionTimeoutTask = (W.setTimeout || setTimeout)(() => {
      const current = completeTurnIndexAuthorityState.branchExpansionLease;
      if (current?.key === key) {
        const timeoutReason = completeTurnIndexAuthorityState.branchExpansionReason === 'native-page-head-controller-exception'
          ? 'controller-exception-timeout'
          : 'timeout';
        chatAtlasFinishBranchExpansion(current, 'fail-closed', timeoutReason);
      }
    }, delay);
    return true;
  }

  function chatAtlasCompleteBranchExpansionCheckpoint(reason = 'expansion-checkpoint', options = {}) {
    const lease = completeTurnIndexAuthorityState.branchExpansionLease;
    if (!chatAtlasBranchExpansionLeaseCurrent(lease)) return false;
    const verdict = chatAtlasEvaluateNativePageHeadsForExpansion(lease);
    completeTurnIndexAuthorityState.branchExpansionReason = verdict.reason;
    if (verdict.state === 'conflict') {
      chatAtlasFinishBranchExpansion(lease, 'fail-closed', verdict.reason);
      return true;
    }
    if (verdict.state === 'unavailable') {
      if (verdict.temporary === true) {
        chatAtlasEnsureBranchExpansionTimeout(lease);
        chatAtlasScheduleBranchExpansionConvergence(
          lease,
          verdict.reason === 'native-page-head-controller-exception'
            ? 'controller-exception-attempts-exhausted'
            : 'attempts-exhausted',
        );
        if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
      } else {
        chatAtlasFinishBranchExpansion(lease, 'fail-closed', verdict.reason);
      }
      return true;
    }
    chatAtlasEnsureBranchExpansionTimeout(lease);
    if (verdict.state === 'absent') {
      chatAtlasScheduleBranchExpansionConvergence(lease);
      if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
      return true;
    }
    if (verdict.state === 'match' && options.allowConfirmation === true) {
      chatAtlasFinishBranchExpansion(lease, 'confirmed', reason);
      return true;
    }
    if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
    return true;
  }

  function chatAtlasRecheckFailedBranchExpansion(reason = 'expansion-recheck') {
    const failure = completeTurnIndexAuthorityState.branchExpansionFailure;
    if (!failure || completeTurnIndexAuthorityState.branchExpansionState !== 'fail-closed') return false;
    const route = chatAtlasFullIndexRoute();
    const targetIndex = chatAtlasCanonicalPresentationIndex();
    const unresolved = failure.targetResolved === false;
    const retainedOverlayScopeCurrent = failure.retainsSelectedPathOverlay !== true || (
      completeTurnIndexAuthorityState.branchSelectionStale === true
      && failure.qId === String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '')
      && failure.staleRevision === Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      && failure.chatId === String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '')
      && failure.routeKey === String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '')
      && failure.generation === Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0)
      && (unresolved ? (
        String(selectedPathAcquisitionState.graph?.captureIdentity || '')
          === String(failure.graphCaptureIdentity || '')
        && selectedPathAcquisitionState.graph?.chatId === failure.chatId
        && selectedPathAcquisitionState.graph?.routeKey === failure.routeKey
        && Number(selectedPathAcquisitionState.graph?.generation || 0) === failure.generation
      ) : (
        failure.token === String(selectedPathOverlayState.token || '')
        && failure.qId === String(selectedPathOverlayState.anchorQId || '')
        && failure.priorFingerprint === String(selectedPathOverlayState.index?.sourceFingerprint || '')
        && chatAtlasSelectedPathOverlayCurrent()
      ))
    );
    if (
      failure.chatId !== String(completeTurnIndexAuthorityState.chatId || '')
      || failure.routeKey !== String(completeTurnIndexAuthorityState.routeKey || '')
      || failure.generation !== Number(completeTurnIndexAuthorityState.generation || 0)
      || failure.chatId !== String(route?.chatId || '')
      || failure.routeKey !== String(route?.routeKey || '')
      || !retainedOverlayScopeCurrent
    ) return false;
    if (!unresolved && (
      !Array.isArray(targetIndex?.turns)
      || targetIndex.turns.length !== Number(failure.targetCount || 0)
      || String(targetIndex?.sourceFingerprint || '') !== String(failure.expectedFingerprint || '')
    )) return false;
    const failureCandidate = unresolved ? Object.freeze({
      classification: 'expanding',
      reason: 'graph-derived-expanding-return',
      targetVariantAnswerId: failure.targetVariantAnswerId,
      graphCaptureIdentity: failure.graphCaptureIdentity,
      graphCapturedAt: '',
      derivedTargetCount: failure.graphDerivedTargetCount,
      derivedPathIdentity: failure.graphDerivedPathIdentity,
      derivedPathMembers: failure.graphDerivedPathMembers,
      priorPresentationSource: 'retained-selected-path-graph',
    }) : null;
    const intent = Object.freeze({
      token: failure.token,
      qId: failure.qId,
      chatId: failure.chatId,
      routeKey: failure.routeKey,
      generation: failure.generation,
      staleRevision: failure.staleRevision,
      priorEffectiveCount: failure.priorCount,
      priorEffectiveFingerprint: failure.priorFingerprint
        || completeTurnIndexAuthorityState.branchExpansionPriorFingerprint,
      returnTargetCandidate: failureCandidate,
    });
    if (unresolved) {
      if (
        !failure.graphCaptureIdentity
        || !failure.targetVariantAnswerId
        || Number(failure.graphDerivedTargetCount || 0) <= Number(failure.priorCount || 0)
        || !failure.graphDerivedPathIdentity
      ) return false;
      const validation = chatAtlasRealBranchExpansionTargetValidation(
        intent,
        targetIndex,
        failureCandidate,
      );
      if (!validation.ok) return false;
    }
    const lease = chatAtlasOpenBranchExpansion(intent, targetIndex);
    if (!lease) return false;
    return chatAtlasCompleteBranchExpansionCheckpoint(reason, { allowConfirmation: true });
  }

  function chatAtlasOpenBranchExpansion(intent, targetIndex) {
    const priorCount = Math.max(0, Number(intent?.priorEffectiveCount || 0) || 0);
    const targetCount = Array.isArray(targetIndex?.turns) ? targetIndex.turns.length : 0;
    if (targetCount <= priorCount) return null;
    const expectedFingerprint = String(targetIndex?.sourceFingerprint || '');
    const requiredPageNums = chatAtlasBranchExpansionRequiredPageNums(priorCount, targetCount);
    chatAtlasClearBranchExpansionTimers();
    completeTurnIndexAuthorityState.branchExpansionSequence += 1;
    const openedAt = Date.now();
    const lease = {
      key: `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
        intent.chatId,
        intent.routeKey,
        intent.generation,
        intent.staleRevision,
        priorCount,
        targetCount,
        expectedFingerprint,
        completeTurnIndexAuthorityState.branchExpansionSequence,
      ]))}`,
      token: String(intent.token || ''),
      qId: String(intent.qId || ''),
      chatId: String(intent.chatId || ''),
      routeKey: String(intent.routeKey || ''),
      generation: Number(intent.generation || 0),
      staleRevision: Number(intent.staleRevision || 0),
      priorCount,
      priorFingerprint: String(intent.priorEffectiveFingerprint || ''),
      targetCount,
      expectedFingerprint,
      openedAt,
      deadlineAt: openedAt + CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS,
      attemptCount: 0,
      requiredPageNums,
    };
    completeTurnIndexAuthorityState.branchExpansionLease = lease;
    completeTurnIndexAuthorityState.branchExpansionFailure = null;
    completeTurnIndexAuthorityState.branchExpansionState = 'pending';
    completeTurnIndexAuthorityState.branchExpansionReason = 'anchor-returned-provisional';
    completeTurnIndexAuthorityState.branchExpansionAnchorReturned = true;
    completeTurnIndexAuthorityState.branchExpansionPriorCount = priorCount;
    completeTurnIndexAuthorityState.branchExpansionPriorFingerprint = lease.priorFingerprint;
    completeTurnIndexAuthorityState.branchExpansionTargetCount = targetCount;
    completeTurnIndexAuthorityState.branchExpansionExpectedFingerprint = expectedFingerprint;
    completeTurnIndexAuthorityState.branchExpansionRequiredPageNums = requiredPageNums;
    return lease;
  }

  function chatAtlasBranchExpansionRebuildSnapshot() {
    const lease = completeTurnIndexAuthorityState.branchExpansionLease;
    if (!chatAtlasBranchExpansionLeaseCurrent(lease)) return null;
    return Object.freeze({
      token: lease.token,
      chatId: lease.chatId,
      routeKey: lease.routeKey,
      staleRevision: lease.staleRevision,
      priorEffectiveCount: lease.priorCount,
      priorEffectiveFingerprint: lease.priorFingerprint,
    });
  }

  // ── Branch transaction: the single owner of a native branch switch ──────
  // A trusted click opens exactly one keyed pending transaction. It — not the
  // intent's age window, not one stale boolean — owns transition containment:
  // while pending, the intent survives (so the ledger can re-derive the path
  // on every flush as scrolling mounts fork evidence) and no unmatched
  // mounted turn may extend authority. It closes only on atomic publication
  // (overlay active / canonical return / expansion confirmed), a superseding
  // capture, route/generation change, or the bounded cap — never silently.
  const CHAT_ATLAS_BRANCH_TRANSACTION_CAP_MS = 90000;
  function chatAtlasBranchTransactionTrace(code, detail = {}) {
    const trace = completeTurnIndexAuthorityState.branchTransactionTrace;
    const entry = {
      seq: (completeTurnIndexAuthorityState.branchTransactionSeq += 1),
      code: chatAtlasCompleteIndexCode(code, 'tx', 32),
      detail: chatAtlasCompleteIndexCode(String(detail?.reason ?? detail?.count ?? detail?.token ?? ''), '', 72),
    };
    const last = trace[trace.length - 1];
    if (last && last.code === entry.code && last.detail === entry.detail) return;
    trace.push(entry);
    if (trace.length > 24) trace.splice(0, trace.length - 24);
  }
  function chatAtlasBranchTransactionCurrent() {
    const tx = completeTurnIndexAuthorityState.branchTransactionState;
    if (!tx) return null;
    if (tx.state === 'pending' && (Date.now() - Number(tx.openedAt || 0)) > CHAT_ATLAS_BRANCH_TRANSACTION_CAP_MS) {
      tx.state = 'fail-closed';
      tx.reason = 'transaction-cap';
      chatAtlasBranchTransactionTrace('tx-fail-closed', { reason: 'transaction-cap' });
    }
    return tx;
  }
  function chatAtlasOpenBranchTransaction(intent) {
    if (!intent?.token) return null;
    const prior = completeTurnIndexAuthorityState.branchTransactionState;
    if (prior && prior.state === 'pending') {
      chatAtlasBranchTransactionTrace('tx-superseded', { token: prior.token });
    }
    const tx = {
      token: String(intent.token),
      qId: String(intent.qId || ''),
      chatId: String(intent.chatId || ''),
      routeKey: String(intent.routeKey || ''),
      generation: Number(intent.generation || 0),
      staleRevision: Number(intent.staleRevision || 0),
      openedAt: Date.now(),
      openFingerprint: String(completeTurnIndexAuthorityState.index?.sourceFingerprint || ''),
      graphCaptureIdentity: '',
      graphEvaluationKey: '',
      state: 'pending',
      reason: 'capture',
    };
    completeTurnIndexAuthorityState.branchTransactionState = tx;
    chatAtlasBranchTransactionTrace('tx-open', { token: tx.token });
    return tx;
  }
  function chatAtlasCloseBranchTransaction(state, reason, token = '') {
    const tx = completeTurnIndexAuthorityState.branchTransactionState;
    if (!tx) return false;
    if (token && tx.token !== token) return false;
    const nextState = state === 'published'
      ? 'published'
      : (state === 'reset' ? 'reset' : 'fail-closed');
    if (tx.state === 'published' || tx.state === 'reset') return false;
    if (tx.state === 'fail-closed' && nextState === 'fail-closed') return false;
    tx.state = nextState;
    tx.reason = chatAtlasCompleteIndexCode(reason, 'closed', 64);
    chatAtlasBranchTransactionTrace(`tx-${tx.state}`, { reason: tx.reason });
    return true;
  }

  function chatAtlasClearBranchSelectionStale(checkpoint, reason = 'branch-stale-cleared', notify = true) {
    if (completeTurnIndexAuthorityState.branchSelectionStale !== true) return false;
    if (checkpoint && (
      Number(checkpoint.revision || 0) !== Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      || String(checkpoint.qId || '') !== String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '')
      || String(checkpoint.chatId || '') !== String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '')
      || String(checkpoint.routeKey || '') !== String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '')
      || Number(checkpoint.generation || 0) !== Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0)
    )) return false;
    completeTurnIndexAuthorityState.branchSelectionStale = false;
    completeTurnIndexAuthorityState.branchStaleLastClearReason = chatAtlasCompleteIndexCode(reason, 'branch-stale-cleared', 64);
    chatAtlasBranchTransactionTrace('stale-clear', { reason });
    completeTurnIndexAuthorityState.branchSelectionStaleQId = null;
    completeTurnIndexAuthorityState.branchSelectionStaleChatId = null;
    completeTurnIndexAuthorityState.branchSelectionStaleRouteKey = '';
    completeTurnIndexAuthorityState.branchSelectionStaleGeneration = 0;
    if (typeof chatAtlasClearSelectedPathOverlay === 'function') {
      chatAtlasClearSelectedPathOverlay(reason);
    }
    if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
      chatAtlasClearSelectedPathAcquisition(reason, { preserveGraph: true });
    }
    chatAtlasTraceTrustedLifecycle('branch-stale-cleared', { reason });
    if (notify) chatAtlasNotifyCompleteIndexState();
    return true;
  }

  function chatAtlasClearBranchSelectionStaleOnCanonicalReturn(members = []) {
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    if (!intent || completeTurnIndexAuthorityState.branchSelectionStale !== true) return false;
    const qId = chatAtlasCompleteIndexIdentity(intent.qId);
    const priorAnswerId = chatAtlasCompleteIndexIdentity(intent.priorAnswerId);
    const revision = Number(intent.staleRevision || 0);
    const route = chatAtlasFullIndexRoute();
    if (
      !qId
      || !priorAnswerId
      || revision !== Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      || qId !== String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '')
      || intent.chatId !== String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '')
      || intent.routeKey !== String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '')
      || intent.generation !== Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0)
      || route.chatId !== intent.chatId
      || route.routeKey !== intent.routeKey
      || intent.generation !== Number(completeTurnIndexAuthorityState.generation || 0)
    ) return false;
    const canonicalMatches = (Array.isArray(completeTurnIndexAuthorityState.index?.turns)
      ? completeTurnIndexAuthorityState.index.turns
      : []).filter((turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === qId);
    if (canonicalMatches.length !== 1) return false;
    const canonical = canonicalMatches[0];
    const canonicalPrimaryAId = chatAtlasCompleteIndexIdentity(canonical?.primaryAId);
    if (chatAtlasCompleteIndexIdentity(canonical?.qId) !== qId || !canonicalPrimaryAId) return false;
    const currentMembers = (Array.isArray(members) ? members : []).filter((member) => (
      chatAtlasCompleteIndexIdentity(member?.question?.currentQId) === qId
      && member?.answer?.currentProjectionSource === 'native-evidence'
    ));
    if (currentMembers.length !== 1) return false;
    const selectedAnswerIds = chatAtlasCv2CurrentIds(currentMembers[0]?.answer?.currentAnswerIds || []);
    if (selectedAnswerIds.length !== 1) return false;
    const selectedAnswerId = chatAtlasCompleteIndexIdentity(selectedAnswerIds[0]);
    if (!selectedAnswerId || selectedAnswerId === priorAnswerId || selectedAnswerId !== canonicalPrimaryAId) {
      return false;
    }
    const targetIndex = chatAtlasCanonicalPresentationIndex();
    const priorCount = Math.max(0, Number(intent.priorEffectiveCount || 0) || 0);
    const targetCount = Array.isArray(targetIndex?.turns) ? targetIndex.turns.length : 0;
    if (targetCount > priorCount) {
      const candidate = intent?.returnTargetCandidate || null;
      if (candidate?.classification === 'expanding') {
        const validation = chatAtlasRealBranchExpansionTargetValidation(
          intent,
          targetIndex,
          candidate,
        );
        if (!validation.ok) {
          chatAtlasFailClosedPreExpansionReturn(
            intent,
            null,
            'pre-expansion-return-target-mismatch',
            { allowTargetArrival: true },
          );
          return true;
        }
      }
      const lease = chatAtlasOpenBranchExpansion(intent, targetIndex);
      if (lease) {
        chatAtlasTraceTrustedLifecycle('branch-expansion-anchor-returned', {
          priorCount,
          targetCount,
          requiredPageNums: lease.requiredPageNums.join(','),
        });
        chatAtlasCompleteBranchExpansionCheckpoint('native-branch-returned-to-canonical', {
          allowConfirmation: false,
        });
        return true;
      }
    }
    const checkpoint = Object.freeze({
      revision,
      qId,
      chatId: intent.chatId,
      routeKey: intent.routeKey,
      generation: intent.generation,
    });
    const cleared = chatAtlasClearBranchSelectionStale(checkpoint, 'native-branch-returned-to-canonical');
    if (cleared) chatAtlasCloseBranchTransaction('published', 'native-branch-returned-to-canonical', String(intent.token || ''));
    if (cleared && completeTurnIndexAuthorityState.trustedSelectedPathIntent?.token === intent.token) {
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
      chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
        reason: 'native-branch-returned-to-canonical',
        qId,
        token: intent.token,
      });
    }
    return cleared;
  }

  function chatAtlasCompleteIndexExplicitRefreshSucceeded(result) {
    const status = String(result?.status || '');
    return status === 'complete-refresh-validated'
      || status === 'complete-validated'
      || status === 'complete-from-host-payload';
  }

  function chatAtlasCompleteIndexFingerprint(turns = []) {
    const identity = (Array.isArray(turns) ? turns : []).map((turn) => [
      String(turn?.qId || ''),
      String(turn?.primaryAId || ''),
      ...(Array.isArray(turn?.answerVariants) ? turn.answerVariants.map((id) => String(id || '')) : []),
      turn?.noAnswer === true ? 'no-answer:1' : 'no-answer:0',
      turn?.stopped === true ? 'stopped:1' : 'stopped:0',
    ]);
    return `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(identity))}`;
  }

  // ── Native downstream-edit convergence ──────────────────────────────────
  // After a trusted branch selection publishes the complete branch, the host
  // can still be displaying a DIFFERENT downstream edit at some turn: the
  // user's chosen route exists in the graph, but ChatGPT's own edit selector
  // at that position points at a shorter sibling, so the turns beyond it are
  // never rendered. Convergence activates ONLY the exact native control that
  // provably owns the mounted identity, and ONLY toward a sibling whose
  // identity is proven from the same graph the branch was derived from.
  // Every step is identity-proven; nothing is chosen by text, position,
  // direction or branch number, and anything unproven fails closed.
  const CHAT_ATLAS_CONVERGENCE_MAX_STEPS = 8;

  function chatAtlasConvergenceTrace(code, detail = {}) {
    chatAtlasBranchTransactionTrace(code, detail);
  }

  // ── The complete nested branch-selection vector ───────────────────────────
  // Every branch point on the authoritative path — question edits AND assistant
  // regenerations — read from the SAME retained identity graph the branch was
  // derived from. Declarative: it never touches the DOM and never activates.

  function chatAtlasConvergenceGraphScope() {
    const retained = selectedPathAcquisitionState.graph;
    const graph = retained?.identityGraph || null;
    if (!Array.isArray(graph?.nodes)) return { ok: false, reason: 'graph-unavailable' };
    if (
      retained.chatId !== String(completeTurnIndexAuthorityState.chatId || '')
      || retained.routeKey !== String(completeTurnIndexAuthorityState.routeKey || '')
      || Number(retained.generation || 0) !== Number(completeTurnIndexAuthorityState.generation || 0)
    ) return { ok: false, reason: 'graph-scope-drift' };
    return { ok: true, reason: null, graph, byId: new Map(graph.nodes.map((node) => [node.nodeId, node])) };
  }

  function chatAtlasConvergenceUniqueNode(graph, id, productKey) {
    const wanted = chatAtlasCompleteIndexIdentity(id);
    if (!wanted) return null;
    const found = graph.nodes.filter((node) => (
      node?.[productKey] === true && chatAtlasCompleteIndexIdentity(node?.messageId) === wanted
    ));
    return found.length === 1 ? found[0] : null;
  }

  // The direct child of `questionNode` whose subtree carries `node`. THAT child,
  // not the answer message itself, is the unit a native regeneration pager moves
  // between: a variant's answer may sit below wrapper/alias nodes.
  function chatAtlasConvergenceBranchRoot(questionNode, node, byId) {
    if (!questionNode || !node) return null;
    const seen = new Set();
    let current = node;
    while (current?.parentId && current.parentId !== questionNode.nodeId) {
      if (seen.has(current.nodeId)) return null;
      seen.add(current.nodeId);
      current = byId.get(current.parentId);
    }
    return current?.parentId === questionNode.nodeId ? current : null;
  }

  // Answer-branch roots under a question. A USER child is a consecutive-send
  // continuation, never an answer variant.
  function chatAtlasConvergenceAnswerVariantRoots(questionNode, byId) {
    return (questionNode?.childIds || [])
      .map((childId) => byId.get(childId))
      .filter((node) => !!node && node.productUser !== true);
  }

  function chatAtlasConvergenceQuestionVariants(questionNode, byId) {
    const parent = questionNode?.parentId ? byId.get(questionNode.parentId) : null;
    if (!parent) return [];
    return (parent.childIds || [])
      .map((childId) => byId.get(childId))
      .filter((node) => node?.productUser === true);
  }

  // Native pager sibling order for one question's answer variants. Raw graph
  // childIds order IS the host's own sibling order -- the order the native
  // pager walks as 1/N, 2/N -- and it is never re-sorted by which answer is
  // currently primary. turn.answerVariants must NOT be used for this: it is
  // presentation-ordered and deliberately moves primaryAId last, so index+/-1
  // on it does not correspond to pager positions at all.
  //
  // Each root is mapped through chatAtlasAnswerIdentityForRoot, so a branch
  // shell alias resolves to the answer identity the pager actually moves to
  // rather than the shell's own node id.
  //
  // Graph-wide by construction: it resolves the clicked question directly,
  // so it stays correct when that question is not on the current or default
  // route -- which is exactly the case after a manual switch.
  //
  // The graph is supplied EXPLICITLY. Both callers already hold the exact
  // retained graph they have proven to be in scope, and neither may silently
  // fall back to whatever unrelated graph global state happens to hold.
  function chatAtlasNativeOrderedAnswerVariantIdsFromGraph(graph, qIdRaw) {
    const bad = (reason) => Object.freeze({ ok: false, reason, ids: Object.freeze([]) });
    const qId = chatAtlasCompleteIndexIdentity(qIdRaw);
    if (!qId) return bad('capture-anchor-invalid');
    if (!Array.isArray(graph?.nodes) || !graph.nodes.length) {
      return bad('capture-native-order-unavailable');
    }
    const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    const questionNode = chatAtlasConvergenceUniqueNode(graph, qId, 'productUser');
    if (!questionNode) return bad('capture-anchor-ambiguous');
    const roots = chatAtlasConvergenceAnswerVariantRoots(questionNode, byId);
    // Fewer than two answer roots in a graph that IS trustworthy is positive
    // proof that this question has no pager neighbour at all -- it is not the
    // absence of evidence, so it must never be deferred.
    if (!Array.isArray(roots) || roots.length < 2) {
      return bad('capture-direction-neighbor-unavailable');
    }
    const ids = [];
    for (const root of roots) {
      const identity = chatAtlasCompleteIndexIdentity(
        chatAtlasAnswerIdentityForRoot(root, byId),
      );
      if (!identity) return bad('capture-native-order-unresolved');
      if (ids.includes(identity)) return bad('capture-answer-variants-malformed');
      ids.push(identity);
    }
    return Object.freeze({ ok: true, reason: null, ids: Object.freeze(ids) });
  }

  // Current-scope wrapper: the same native ordering read from whatever graph
  // the convergence primitives currently own. Convergence planning already
  // works exclusively in the current scope, so it needs no explicit graph.
  function chatAtlasNativeOrderedAnswerVariantIds(qIdRaw) {
    let scope = null;
    try { scope = chatAtlasConvergenceGraphScope(); } catch { scope = null; }
    if (!scope || scope.ok !== true) {
      return Object.freeze({
        ok: false,
        reason: 'capture-native-order-unavailable',
        ids: Object.freeze([]),
      });
    }
    return chatAtlasNativeOrderedAnswerVariantIdsFromGraph(scope.graph, qIdRaw);
  }

  // The one place a captured trusted click (qId + prior answer + direction)
  // becomes the exact answer identity the native pager moved to. Both the
  // capture-time resolution and the deferred graph-arrival resolution call
  // THIS, so a single arithmetic owns pager adjacency.
  function chatAtlasResolveNativeReturnTarget(graph, qIdRaw, priorAnswerIdRaw, directionRaw) {
    const bad = (reason) => Object.freeze({
      ok: false,
      reason,
      targetVariantAnswerId: '',
      nativeOrderedIds: Object.freeze([]),
    });
    const priorAnswerId = chatAtlasCompleteIndexIdentity(priorAnswerIdRaw);
    const direction = String(directionRaw || '');
    if (!priorAnswerId) return bad('capture-anchor-invalid');
    if (!['previous', 'next'].includes(direction)) return bad('capture-direction-invalid');
    const nativeOrder = chatAtlasNativeOrderedAnswerVariantIdsFromGraph(graph, qIdRaw);
    if (nativeOrder.ok !== true) return bad(nativeOrder.reason);
    const nativeIds = nativeOrder.ids;
    const priorIndexValue = nativeIds.indexOf(priorAnswerId);
    if (priorIndexValue < 0) return bad('capture-prior-answer-absent');
    const targetIndexValue = priorIndexValue + (direction === 'previous' ? -1 : 1);
    const targetVariantAnswerId = targetIndexValue >= 0 && targetIndexValue < nativeIds.length
      ? chatAtlasCompleteIndexIdentity(nativeIds[targetIndexValue])
      : '';
    if (!targetVariantAnswerId) return bad('capture-direction-neighbor-unavailable');
    return Object.freeze({
      ok: true,
      reason: null,
      targetVariantAnswerId,
      nativeOrderedIds: nativeIds,
    });
  }

  // A capture whose exact native sibling order was not yet provable. Only this
  // shape may be resolved later; an `invalid` capture is terminal.
  function chatAtlasReturnTargetCandidatePending(candidate) {
    return candidate?.classification === 'pending'
      && candidate?.targetResolved !== true
      && !chatAtlasCompleteIndexIdentity(candidate?.targetVariantAnswerId);
  }

  function chatAtlasResolvedReturnTargetCandidate(candidate, targetVariantAnswerId, retained) {
    return Object.freeze({
      ...candidate,
      classification: 'resolved',
      reason: 'graph-arrival-resolved-return',
      targetResolved: true,
      targetVariantAnswerId: chatAtlasCompleteIndexIdentity(targetVariantAnswerId),
      graphCaptureIdentity: String(retained?.captureIdentity || ''),
      graphCapturedAt: String(retained?.identityGraph?.capturedAt || ''),
      // Deliberately left unresolved: a deferred capture froze NO route, so the
      // frozen-path guard has nothing legitimate to compare against and must
      // stay inert rather than veto against a route that was never captured.
      derivedTargetCount: 0,
      derivedPathIdentity: '',
      derivedPathMembers: Object.freeze([]),
    });
  }

  function chatAtlasBuildNativeBranchSelectionPlan() {
    const transaction = chatAtlasBranchTransactionCurrent();
    const index = getEffectivePresentationIndex();
    const turns = Array.isArray(index?.turns) ? index.turns : [];
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok || !turns.length) {
      return Object.freeze({
        ok: false,
        reason: scope.ok ? 'effective-path-unavailable' : scope.reason,
        pathLength: turns.length,
        points: Object.freeze([]),
      });
    }
    const points = [];
    for (const turn of turns) {
      if (points.length > 512) break;
      const questionNode = chatAtlasConvergenceUniqueNode(scope.graph, turn?.qId, 'productUser');
      if (!questionNode) continue;
      const order = Number(turn?.order || 0);
      const expectedQId = chatAtlasCompleteIndexIdentity(turn?.qId);
      const expectedPrimaryAId = chatAtlasCompleteIndexIdentity(turn?.primaryAId) || null;
      const questionVariants = chatAtlasConvergenceQuestionVariants(questionNode, scope.byId);
      if (questionVariants.length > 1) {
        points.push(Object.freeze({
          order,
          kind: 'question-edit',
          ownerNodeId: questionNode.parentId,
          ownerRole: 'user',
          variantIds: Object.freeze(questionVariants.map((node) => node.nodeId)),
          expectedIndex: questionVariants.findIndex((node) => node.nodeId === questionNode.nodeId),
          expectedCount: questionVariants.length,
          expectedQId,
          expectedPrimaryAId,
        }));
      }
      const answerRoots = chatAtlasConvergenceAnswerVariantRoots(questionNode, scope.byId);
      if (answerRoots.length > 1 && expectedPrimaryAId) {
        const answerNode = chatAtlasConvergenceUniqueNode(scope.graph, expectedPrimaryAId, 'productAnswer');
        const selectedRoot = chatAtlasConvergenceBranchRoot(questionNode, answerNode, scope.byId);
        points.push(Object.freeze({
          order,
          kind: 'assistant-regeneration',
          ownerNodeId: questionNode.nodeId,
          ownerRole: 'assistant',
          variantIds: Object.freeze(answerRoots.map((node) => node.nodeId)),
          expectedIndex: selectedRoot
            ? answerRoots.findIndex((node) => node.nodeId === selectedRoot.nodeId)
            : -1,
          expectedCount: answerRoots.length,
          expectedQId,
          expectedPrimaryAId,
        }));
      }
    }
    const terminal = turns[turns.length - 1];
    return Object.freeze({
      ok: true,
      reason: null,
      token: String(transaction?.token || ''),
      chatId: String(completeTurnIndexAuthorityState.chatId || ''),
      routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
      fingerprint: String(index?.sourceFingerprint || ''),
      pathLength: turns.length,
      terminalQId: chatAtlasCompleteIndexIdentity(terminal?.qId) || null,
      terminalPrimaryAId: chatAtlasCompleteIndexIdentity(terminal?.primaryAId) || null,
      points: Object.freeze(points),
    });
  }

  // ── Default path: the newest-created terminal ─────────────────────────────
  // The default branch is the complete root-to-leaf path whose eligible
  // terminal message was created last. Never the longest path, never the
  // mounted DOM order, never a branch number, never graph array order.

  function chatAtlasGraphCreateTime(node) {
    const value = node?.createTime;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  }

  function chatAtlasGraphIsProductNode(node) {
    return node?.productUser === true || node?.productAnswer === true;
  }

  // Every distinct conversation endpoint. A graph leaf that is a structural
  // tool/system wrapper is NOT an endpoint: the endpoint is the nearest
  // product message above it.
  function chatAtlasEligibleTerminalNodes(graph, byId) {
    const out = [];
    const seen = new Set();
    for (const node of graph.nodes) {
      if ((node?.childIds || []).length) continue;
      let cursor = node;
      const guard = new Set();
      while (cursor && !chatAtlasGraphIsProductNode(cursor)) {
        if (guard.has(cursor.nodeId)) { cursor = null; break; }
        guard.add(cursor.nodeId);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
      }
      if (!cursor || seen.has(cursor.nodeId)) continue;
      seen.add(cursor.nodeId);
      out.push(cursor);
    }
    return out;
  }

  function chatAtlasSelectLatestCreatedTerminal(graph, byId) {
    const fail = (reason) => Object.freeze({ ok: false, reason, node: null, createTime: null });
    const terminals = chatAtlasEligibleTerminalNodes(graph, byId);
    if (!terminals.length) return fail('terminal-unavailable');
    // A terminal without a trustworthy creation time could be the newest one.
    // Comparing the rest would be a guess, so the whole selection fails closed.
    if (terminals.some((node) => chatAtlasGraphCreateTime(node) === null)) {
      return fail('terminal-create-time-incomplete');
    }
    let best = null;
    let tied = false;
    for (const node of terminals) {
      const created = chatAtlasGraphCreateTime(node);
      if (!best || created > chatAtlasGraphCreateTime(best)) { best = node; tied = false; continue; }
      if (created === chatAtlasGraphCreateTime(best)) tied = true;
    }
    if (!best) return fail('terminal-unavailable');
    if (tied) return fail('terminal-create-time-tie');
    return Object.freeze({
      ok: true,
      reason: 'latest-created-terminal',
      node: best,
      createTime: chatAtlasGraphCreateTime(best),
    });
  }

  // The root-to-node chain. In a tree every node has one parent, so the path
  // to a chosen terminal is unique — no fork resolution is involved.
  function chatAtlasChainToRoot(byId, node) {
    const chain = [];
    const guard = new Set();
    let cursor = node;
    while (cursor) {
      if (guard.has(cursor.nodeId)) return null;
      guard.add(cursor.nodeId);
      chain.push(cursor);
      if (chain.length > 4096) return null;
      cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
    }
    chain.reverse();
    return chain;
  }

  // The identity a native answer pager moves to for one answer-branch root.
  function chatAtlasAnswerIdentityForRoot(root, byId) {
    if (!root) return '';
    if (root.branchShellAlias === true || root.productAnswer === true) {
      return chatAtlasCompleteIndexIdentity(root.messageId) || '';
    }
    const queue = [root];
    const guard = new Set();
    while (queue.length) {
      const node = queue.shift();
      if (!node || guard.has(node.nodeId)) continue;
      guard.add(node.nodeId);
      if (guard.size > 512) break;
      if (node.productAnswer === true) return chatAtlasCompleteIndexIdentity(node.messageId) || '';
      if (node.productUser === true && node !== root) continue;
      for (const childId of node.childIds || []) queue.push(byId.get(childId));
    }
    return '';
  }

  // Turn records for one chain, in the shape the effective index publishes.
  // Two identities per turn, deliberately separate (Stage 2C-2ai1):
  //
  //   BRANCH ROOT  — the first product answer or branch-shell alias below the
  //                  question on this chain. Branch authority: variant sets,
  //                  sibling proofs, selected branch index.
  //   DISPLAY      — the LAST eligible product answer before the next
  //                  product-user node. Presentation identity: primaryAId.
  //
  // The display rule mirrors the canonical host-payload projection in 0D3a
  // (`selectedProductAssistantKeys[...length - 1]`, window closed by the next
  // product-user node, eligibility = role assistant AND productAnswer). One
  // graph chain therefore projects to ONE row set whichever module walks it.
  // branchRootId may differ from primaryAId without implying any divergence.
  function chatAtlasTurnsFromChain(chain, byId, collect = null) {
    const turns = [];
    let open = null;
    const close = () => {
      if (!open) return;
      const roots = chatAtlasConvergenceAnswerVariantRoots(open.questionNode, byId);
      const branchRootAId = open.branchRootNode
        ? (chatAtlasCompleteIndexIdentity(open.branchRootNode.messageId) || null)
        : null;
      const answerVariants = roots
        .map((root) => chatAtlasAnswerIdentityForRoot(root, byId))
        .filter(Boolean);
      let primaryAId = open.displayNode
        ? (chatAtlasCompleteIndexIdentity(open.displayNode.messageId) || null)
        : branchRootAId;
      // Canonical system-branch-root promotion, mirroring 0D3a:1013-1021. A
      // SYSTEM branch root that is itself an owned variant identity IS the
      // displayed answer — that is the identity the native pager moves to. An
      // ASSISTANT root is preserved instead ('branch-root-assistant-preserved')
      // and the last eligible product answer stands. A hidden alias is never
      // displayed on any other ground.
      if (
        branchRootAId
        && branchRootAId !== primaryAId
        && String(open.branchRootNode?.role || '').trim().toLowerCase() === 'system'
        && answerVariants.includes(branchRootAId)
      ) primaryAId = branchRootAId;
      if (primaryAId) {
        const at = answerVariants.indexOf(primaryAId);
        if (at >= 0) answerVariants.splice(at, 1);
        answerVariants.push(primaryAId);
      }
      if (collect) {
        collect.push(Object.freeze({
          order: turns.length + 1,
          qId: open.qId,
          branchRootAId,
          primaryAId,
          branchRootIsPrimary: !!branchRootAId && branchRootAId === primaryAId,
          displayResolvedFromBranchRoot: !!open.displayNode && !!open.branchRootNode
            && chatAtlasConvergenceBranchRoot(open.questionNode, open.displayNode, byId)?.nodeId
              === chatAtlasConvergenceBranchRoot(open.questionNode, open.branchRootNode, byId)?.nodeId,
        }));
      }
      turns.push(chatAtlasFreeze({
        order: turns.length + 1,
        qId: open.qId,
        turnId: `turn:${open.qId}`,
        primaryAId,
        answerVariants,
        noAnswer: !primaryAId,
        stopped: open.stopped === true,
        // Same tag the manual resolver uses for rows walked from the graph.
        provenance: 'graph-descent',
        confirmedByNativeEvidence: false,
      }));
      open = null;
    };
    for (const node of chain) {
      if (node?.productUser === true) {
        close();
        const qId = chatAtlasCompleteIndexIdentity(node.messageId);
        if (!qId) return null;
        open = {
          qId,
          questionNode: node,
          branchRootNode: null,
          displayNode: null,
          stopped: node.stopped === true,
        };
        continue;
      }
      if (!open) continue;
      // The first product answer or branch-shell alias below the question on
      // this chain IS the selected answer-branch root for that turn.
      if (!open.branchRootNode && (node?.productAnswer === true || node?.branchShellAlias === true)) {
        open.branchRootNode = node;
      }
      // Canonical display window: keep the LAST eligible product answer, and
      // inherit stopped from any assistant inside the window.
      if (String(node?.role || '').trim().toLowerCase() === 'assistant') {
        if (node.stopped === true) open.stopped = true;
        if (node.productAnswer === true) open.displayNode = node;
      }
    }
    close();
    if (!turns.length) return null;
    if (new Set(turns.map((turn) => turn.qId)).size !== turns.length) return null;
    return turns;
  }

  // The active choice at every branch point along the chain: which question
  // variant and which answer variant this path actually takes.
  function chatAtlasBranchVectorForChain(chain, byId) {
    const onChain = new Set(chain.map((node) => node.nodeId));
    const vector = [];
    let order = 0;
    for (const node of chain) {
      if (node?.productUser !== true) continue;
      order += 1;
      const questionVariants = chatAtlasConvergenceQuestionVariants(node, byId);
      if (questionVariants.length > 1) {
        vector.push(Object.freeze({
          order,
          kind: 'question-edit',
          ownerMessageId: chatAtlasCompleteIndexIdentity(byId.get(node.parentId)?.messageId) || '',
          ownerRole: 'user',
          variantIds: Object.freeze(questionVariants.map((entry) => entry.nodeId)),
          variantCreateTimes: Object.freeze(questionVariants.map(chatAtlasGraphCreateTime)),
          selectedIndex: questionVariants.findIndex((entry) => entry.nodeId === node.nodeId),
          variantCount: questionVariants.length,
          selectedMessageId: chatAtlasCompleteIndexIdentity(node.messageId) || '',
        }));
      }
      const answerRoots = chatAtlasConvergenceAnswerVariantRoots(node, byId);
      if (answerRoots.length > 1) {
        const selected = answerRoots.findIndex((root) => onChain.has(root.nodeId));
        vector.push(Object.freeze({
          order,
          kind: 'assistant-regeneration',
          ownerMessageId: chatAtlasCompleteIndexIdentity(node.messageId) || '',
          ownerRole: 'assistant',
          variantIds: Object.freeze(answerRoots.map((entry) => entry.nodeId)),
          variantCreateTimes: Object.freeze(answerRoots.map(chatAtlasGraphCreateTime)),
          selectedIndex: selected,
          variantCount: answerRoots.length,
          selectedMessageId: selected >= 0
            ? chatAtlasAnswerIdentityForRoot(answerRoots[selected], byId)
            : '',
        }));
      }
    }
    return vector;
  }

  function chatAtlasComputeDefaultLatestCreatedPath() {
    const fail = (reason) => Object.freeze({
      ok: false, reason, terminalNodeId: null, rootNodeId: null, terminalMessageId: null,
      terminalCreateTime: null, turns: Object.freeze([]), branchVector: Object.freeze([]),
      branchRoots: Object.freeze([]),
      count: 0, fingerprint: '', source: 'latest-created-terminal',
    });
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return fail(scope.reason);
    const chosen = chatAtlasSelectLatestCreatedTerminal(scope.graph, scope.byId);
    if (!chosen.ok) return fail(chosen.reason);
    const chain = chatAtlasChainToRoot(scope.byId, chosen.node);
    if (!chain) return fail('terminal-chain-unresolved');
    const branchRoots = [];
    const turns = chatAtlasTurnsFromChain(chain, scope.byId, branchRoots);
    if (!turns) return fail('terminal-chain-not-a-path');
    return Object.freeze({
      ok: true,
      reason: null,
      terminalNodeId: chosen.node.nodeId,
      rootNodeId: chain[0]?.nodeId || null,
      terminalMessageId: chatAtlasCompleteIndexIdentity(chosen.node.messageId) || null,
      terminalCreateTime: chosen.createTime,
      turns: Object.freeze(turns),
      branchRoots: Object.freeze(branchRoots),
      branchVector: Object.freeze(chatAtlasBranchVectorForChain(chain, scope.byId)),
      count: turns.length,
      fingerprint: chatAtlasCompleteIndexFingerprint(turns),
      source: 'latest-created-terminal',
    });
  }

  // ── Default-origin publication ────────────────────────────────────────────
  // Publishes the newest-created path through the SAME overlay installation
  // the manual origin uses. It never fabricates a trusted intent: the overlay
  // admits it under origin 'default-latest-created', proving graph capture,
  // terminal identity and the absence of a manual override instead.
  // ── Reveal safety framework (Stage 2C-2ag1) ──────────────────────────────
  // Everything here is READ-ONLY with respect to the page. The one-shot reveal
  // action is deliberately disabled: this stage builds the container proof,
  // the transaction pinning, the viewport bookmark, the restoration and the
  // user-supersession detection, and proves them with the action stubbed.

  const CHAT_ATLAS_REVEAL_SCROLLABLE_OVERFLOW = /^(auto|scroll|overlay)$/;

  function chatAtlasRevealIsScrollable(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      const overflowY = String(W.getComputedStyle?.(el)?.overflowY || '');
      if (!CHAT_ATLAS_REVEAL_SCROLLABLE_OVERFLOW.test(overflowY)) return false;
      return Number(el.scrollHeight || 0) > Number(el.clientHeight || 0) + 4;
    } catch { return false; }
  }

  // The scroll container that GOVERNS the mounted conversation turns. Anchored
  // on turn identity and walked upward — never chosen by being the biggest
  // scrollable thing on the page, which would happily pick a side panel. Two
  // existing modules already resolve the conversation scroller this way
  // (0D3c resolveChatScrollHost, 1A1c MINI_completeIndexScrollRoot); this adds
  // the ambiguity proof neither of them makes: EVERY mounted turn must resolve
  // to the SAME governing element, and there is no fallback to the document.
  function chatAtlasResolveConversationScrollContainer() {
    const fail = (reason, candidates = 0) => Object.freeze({
      ok: false, reason, element: null, candidateCount: candidates,
    });
    let sections = [];
    try {
      sections = Array.from(D.querySelectorAll('[data-testid^="conversation-turn-"]'));
    } catch { return fail('reveal-container-query-failed'); }
    if (!sections.length) return fail('reveal-container-no-mounted-turns');
    const governing = new Map();
    for (const section of sections) {
      let cursor = section;
      let found = null;
      let hops = 0;
      while (cursor && hops < 64) {
        hops += 1;
        cursor = cursor.parentElement;
        if (!cursor) break;
        // The document scroller is never the conversation container.
        if (cursor === D.body || cursor === D.documentElement) break;
        if (chatAtlasRevealIsScrollable(cursor)) { found = cursor; break; }
      }
      if (!found) continue;
      const entry = governing.get(found) || { element: found, turns: 0 };
      entry.turns += 1;
      governing.set(found, entry);
    }
    const candidates = Array.from(governing.values());
    if (!candidates.length) return fail('reveal-container-unresolved');
    // Ambiguity is a refusal, not a tie-break: two governing scrollers means
    // the conversation subtree is not what we think it is.
    if (candidates.length > 1) return fail('reveal-container-ambiguous', candidates.length);
    const winner = candidates[0];
    if (winner.element === D.scrollingElement) return fail('reveal-container-is-document', 1);
    return Object.freeze({
      ok: true,
      reason: null,
      element: winner.element,
      candidateCount: 1,
      governedTurns: winner.turns,
    });
  }

  function chatAtlasRevealContainerDiagnostics() {
    const resolved = chatAtlasResolveConversationScrollContainer();
    const el = resolved.ok ? resolved.element : null;
    return Object.freeze({
      revealContainerState: resolved.ok ? 'resolved' : 'unresolved',
      revealContainerReason: resolved.reason,
      revealContainerCandidateCount: Number(resolved.candidateCount || 0),
      revealContainerGovernedTurns: Number(resolved.governedTurns || 0),
      // Content-free by construction: the tag comes from a fixed vocabulary and
      // the test id is reduced to a stable hash. Diagnostics never carry raw
      // page strings, so container identity stays comparable across reloads
      // without leaking anything from the conversation.
      revealContainerTag: el ? String(el.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') : null,
      revealContainerTestIdHash: el && el.getAttribute?.('data-testid')
        ? `djb2:${chatAtlasCompleteIndexStableHash(String(el.getAttribute('data-testid')))}`
        : null,
      revealContainerClientHeight: el ? Number(el.clientHeight || 0) : 0,
      revealContainerScrollHeight: el ? Number(el.scrollHeight || 0) : 0,
      revealContainerScrollTop: el ? Number(el.scrollTop || 0) : 0,
    });
  }

  const chatAtlasRevealState = {
    transactionState: 'idle',
    token: '',
    reason: null,
    superseded: false,
    supersededBy: null,
    attempts: 0,
    topScrollExecuted: false,
    internalDepth: 0,
    listeners: [],
    pin: null,
    bookmark: null,
    restoreState: 'idle',
    restoreReason: null,
    restoreMethod: null,
    restoreTargetId: null,
    restoreOffset: 0,
    restoreFinalScrollTop: 0,
    restoreRequestedScrollTop: 0,
    restoreFirstMeasuredScrollTop: 0,
    restoreMeasuredOffset: 0,
    restoreOffsetError: 0,
    restoreCorrectionAttempts: 0,
    restoreCorrectionReason: null,
    pagerAudit: null,
    pagerLocator: null,
    container: null,
    ticks: 0,
    readinessState: 'idle',
    readinessReason: null,
    readinessAttempts: 0,
    readinessTarget: null,
    readinessRetryTask: null,
    readinessRetryPending: false,
    readinessRetryScheduled: 0,
    readinessRetryDelayMs: 0,
    readinessRetryGeneration: 0,
    readinessStartedAtNavigationMs: 0,
    readinessFirstResolvedAtNavigationMs: 0,
    readinessTerminalElapsedMs: 0,
    readinessTerminalState: null,
    readinessReadyElapsedMs: 0,
    movementPhase: null,
    movementExpectedTop: 0,
    movementFromTop: 0,
    movementActivatedAtMs: 0,
    movementToken: '',
    movementConsumed: true,
    movementConsumedBy: null,
    supersessionSource: null,
    supersessionEventType: null,
    supersessionEventTrusted: false,
    supersessionPhase: null,
    supersessionInternalDepth: 0,
    supersessionInternalExpectationActive: false,
    supersessionPointerScrollArmed: false,
    supersessionMsAfterTopScroll: 0,
    supersessionScrollTopBefore: 0,
    supersessionScrollTopAfter: 0,
    supersessionExpectedInternalTop: 0,
    supersessionReason: null,
    reconcileState: 'idle',
    reconcileReason: null,
    reconcileAuthorityProbes: 0,
    reconcileScrollWakeups: 0,
    reconcileScheduledProbes: 0,
    reconcileStartedAtNavigationMs: 0,
    reconcileLastProbeAtNavigationMs: 0,
    reconcileTerminalElapsedMs: 0,
    reconcileRetryTask: null,
    reconcileRetryPending: false,
    reconcileRetryGeneration: 0,
    readinessAuthorityProbes: 0,
    readinessScheduledProbes: 0,
    restoreRan: false,
    driftField: null,
    driftHard: false,
    mountedQId: null,
    mountedAId: null,
    pagerPresent: false,
  };

  // Scope pin. Every asynchronous continuation re-checks this before acting.
  function chatAtlasRevealCurrentPin(target) {
    return Object.freeze({
      chatId: String(completeTurnIndexAuthorityState.chatId || ''),
      routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
      graphCaptureIdentity: String(selectedPathAcquisitionState.graph?.captureIdentity || ''),
      defaultTerminalId: chatAtlasDefaultOverlayState.terminalNodeId || null,
      targetOrder: Number(target?.order || 0),
      targetQId: target?.qId || null,
      targetCurrentAId: target?.currentAId || null,
      targetExpectedAId: target?.expectedAId || null,
      divergenceFingerprint: `${Number(target?.order || 0)}:${target?.qId || ''}:${target?.currentAId || ''}:${target?.expectedAId || ''}`,
    });
  }

  // Scope drift, classified. Scrolling to reveal a virtualized turn MOUNTS
  // turns, which re-captures the graph and moves the divergence projection —
  // churn we caused ourselves. Treating that as invalidation aborted the
  // transaction between the scroll and its compensating restore. Only page
  // identity is hard.
  function chatAtlasRevealScopeDrift() {
    const pin = chatAtlasRevealState.pin;
    const none = Object.freeze({ hard: false, soft: false, field: null });
    if (!pin) return Object.freeze({ hard: true, soft: false, field: 'transaction-missing' });
    if (chatAtlasRevealState.superseded === true) {
      return Object.freeze({ hard: true, soft: false, field: 'user-superseded' });
    }
    const now = chatAtlasRevealCurrentPin({
      order: pin.targetOrder,
      qId: pin.targetQId,
      currentAId: pin.targetCurrentAId,
      expectedAId: pin.targetExpectedAId,
    });
    if (now.chatId !== pin.chatId) return Object.freeze({ hard: true, soft: false, field: 'chatId' });
    if (now.routeKey !== pin.routeKey) return Object.freeze({ hard: true, soft: false, field: 'routeKey' });
    if (now.generation !== pin.generation) return Object.freeze({ hard: true, soft: false, field: 'generation' });
    // Soft: a direct consequence of the reveal itself. The pinned target
    // identities are retained and measurement continues.
    if (now.graphCaptureIdentity !== pin.graphCaptureIdentity) {
      return Object.freeze({ hard: false, soft: true, field: 'graphCaptureIdentity' });
    }
    if (now.defaultTerminalId !== pin.defaultTerminalId) {
      return Object.freeze({ hard: false, soft: true, field: 'defaultTerminalId' });
    }
    // The LIVE first-divergence projection, not a rebuild of the pin's own
    // values. Mounting the target moves this projection, which is soft churn:
    // the transaction keeps its original pinned identities.
    const liveFingerprint = `${Number(chatAtlasDefaultOverlayState.revealTargetOrder || 0)}:${chatAtlasDefaultOverlayState.revealTargetQId || ''}:${chatAtlasDefaultOverlayState.revealTargetCurrentAId || ''}:${chatAtlasDefaultOverlayState.revealTargetExpectedAId || ''}`;
    if (liveFingerprint !== pin.divergenceFingerprint) {
      return Object.freeze({ hard: false, soft: true, field: 'divergenceFingerprint' });
    }
    return none;
  }

  function chatAtlasRevealScopeValid() {
    const drift = chatAtlasRevealScopeDrift();
    return drift.hard !== true;
  }

  // Restoration is permitted whenever we moved the page and it is still safe
  // and meaningful to move it back.
  function chatAtlasRevealRestorePermitted() {
    if (chatAtlasRevealState.topScrollExecuted !== true) return false;
    if (chatAtlasRevealState.restoreRan === true) return false;
    if (chatAtlasRevealState.superseded === true) return false;
    const drift = chatAtlasRevealScopeDrift();
    if (drift.hard === true) return false;
    const container = chatAtlasRevealState.container || null;
    if (!container) return false;
    if (container.isConnected === false) return false;
    return true;
  }

  // Terminal exit. The compensating restore ALWAYS runs first when permitted:
  // no terminal state may be written while the page is still where our scroll
  // left it.
  function chatAtlasRevealTerminate(state, reason) {
    if (chatAtlasRevealRestorePermitted()) {
      chatAtlasRevealState.restoreRan = true;
      chatAtlasRevealRestore(chatAtlasRevealState.container);
    } else if (chatAtlasRevealState.topScrollExecuted === true
      && chatAtlasRevealState.restoreState === 'idle') {
      const drift = chatAtlasRevealScopeDrift();
      chatAtlasRevealState.restoreState = 'skipped';
      chatAtlasRevealState.restoreReason = chatAtlasRevealState.superseded === true
        ? 'restore-superseded'
        : (drift.hard === true ? `restore-unsafe:${drift.field}` : 'restore-container-unavailable');
    }
    return chatAtlasRevealFinish(state, reason);
  }

  function chatAtlasRevealClearListeners() {
    for (const entry of chatAtlasRevealState.listeners.splice(0)) {
      try { entry.target?.removeEventListener?.(entry.type, entry.handler, entry.options); } catch {}
    }
  }

  // ONLY these prove a human moved the page. A bare movement signal — a
  // `scroll` event, a virtualization relayout, our own programmatic scroll —
  // is never intent, however trusted the event object says it is.
  const CHAT_ATLAS_REVEAL_GENUINE_INTENT = Object.freeze([
    'wheel', 'touchstart', 'touchmove', 'user-key', 'scrollbar-pointer',
    'manual-branch-selection', 'minimap-navigation',
  ]);

  function chatAtlasRevealIsGenuineIntent(source) {
    return CHAT_ATLAS_REVEAL_GENUINE_INTENT.includes(String(source || ''));
  }

  function chatAtlasRevealRecordSupersessionAttempt(source, detail = {}) {
    const st = chatAtlasRevealState;
    const container = st.container || null;
    st.supersessionSource = String(source || '');
    st.supersessionEventType = String(detail.eventType || '') || null;
    st.supersessionEventTrusted = detail.trusted === true;
    st.supersessionPhase = String(st.movementPhase || st.transactionState || 'idle');
    st.supersessionInternalDepth = Number(st.internalDepth || 0);
    st.supersessionInternalExpectationActive = chatAtlasRevealInternalMovementActive();
    st.supersessionPointerScrollArmed = detail.pointerScrollArmed === true;
    st.supersessionScrollTopBefore = Number(st.movementFromTop || 0);
    st.supersessionScrollTopAfter = container ? Number(container.scrollTop || 0) : 0;
    st.supersessionExpectedInternalTop = Number(st.movementExpectedTop || 0);
    const activatedAt = Number(st.movementActivatedAtMs || 0);
    st.supersessionMsAfterTopScroll = activatedAt
      ? Math.max(0, chatAtlasRevealNavigationMs() - activatedAt)
      : 0;
  }

  function chatAtlasRevealSupersede(by = 'user-action', detail = {}) {
    if (chatAtlasRevealState.transactionState === 'idle') return false;
    if (chatAtlasRevealIsGenuineIntent(by)) chatAtlasRevealCancelReconcileRetry();
    chatAtlasRevealRecordSupersessionAttempt(by, detail);
    if (!chatAtlasRevealIsGenuineIntent(by)) {
      // Recorded for diagnostics, but it does not end the transaction.
      chatAtlasRevealState.supersessionReason = 'ignored-not-user-intent';
      return false;
    }
    chatAtlasRevealState.supersessionReason = 'genuine-user-intent';
    chatAtlasRevealCancelReadinessRetry();
    chatAtlasRevealState.superseded = true;
    chatAtlasRevealState.supersededBy = by;
    chatAtlasRevealState.transactionState = 'superseded';
    chatAtlasRevealState.reason = 'reveal-superseded-by-user-scroll';
    chatAtlasRevealClearListeners();
    return true;
  }

  // A bounded, transaction-scoped expectation that OUR movement is about to
  // land. The old synchronous flag cleared before the browser delivered the
  // asynchronous scroll signal, so our own scroll looked like the user's.
  function chatAtlasRevealArmInternalMovement(phase, expectedTop, fromTop) {
    const st = chatAtlasRevealState;
    st.movementPhase = String(phase || '');
    st.movementExpectedTop = Number(expectedTop || 0);
    st.movementFromTop = Number(fromTop || 0);
    st.movementActivatedAtMs = chatAtlasRevealNavigationMs();
    st.movementToken = String(st.token || '');
    st.movementConsumed = false;
    return st.movementPhase;
  }

  function chatAtlasRevealInternalMovementActive() {
    const st = chatAtlasRevealState;
    if (!st.movementPhase) return false;
    if (st.movementConsumed === true) return false;
    if (String(st.movementToken || '') !== String(st.token || '')) return false;
    // Bounded by the existing reconciliation, never by a timer.
    return Number(st.ticks || 0) <= CHAT_ATLAS_REVEAL_RECONCILE_TICKS;
  }

  function chatAtlasRevealConsumeInternalMovement(source = 'scroll') {
    const st = chatAtlasRevealState;
    if (!chatAtlasRevealInternalMovementActive()) return false;
    st.movementConsumed = true;
    st.movementConsumedBy = String(source || '');
    return true;
  }

  function chatAtlasRevealClearInternalMovement() {
    const st = chatAtlasRevealState;
    st.movementPhase = null;
    st.movementConsumed = true;
    st.movementToken = '';
  }

  function chatAtlasRevealFreezeReconcile(terminalState) {
    const st = chatAtlasRevealState;
    if (Number(st.reconcileTerminalElapsedMs || 0) > 0) return false;
    const started = Number(st.reconcileStartedAtNavigationMs || 0);
    st.reconcileTerminalElapsedMs = started
      ? Math.max(1, chatAtlasRevealNavigationMs() - started)
      : 1;
    st.reconcileState = 'terminal';
    st.reconcileReason = String(terminalState || '') || null;
    return true;
  }

  function chatAtlasRevealFinish(state, reason) {
    chatAtlasRevealCancelReadinessRetry();
    chatAtlasRevealCancelReconcileRetry();
    if (chatAtlasRevealState.topScrollExecuted === true) chatAtlasRevealFreezeReconcile(state);
    chatAtlasRevealClearInternalMovement();
    chatAtlasRevealState.transactionState = state;
    chatAtlasRevealState.reason = reason;
    chatAtlasRevealClearListeners();
    return Object.freeze({ ok: state === 'target-mounted', state, reason });
  }

  // Our own scroll and restore movements must not look like the user's.
  function chatAtlasRevealInternal(run) {
    chatAtlasRevealState.internalDepth += 1;
    try { return run(); } finally {
      chatAtlasRevealState.internalDepth = Math.max(0, chatAtlasRevealState.internalDepth - 1);
    }
  }

  function chatAtlasRevealInstallUserListeners(container) {
    chatAtlasRevealClearListeners();
    // Each event is classified on its own terms; only proven intent supersedes.
    const onIntent = (type) => (event) => {
      chatAtlasRevealSupersede(type, { eventType: type, trusted: event?.isTrusted === true });
    };
    // A bare scroll signal only CONSUMES our pending internal movement. It can
    // never supersede — this is the exact false positive being removed.
    const onScroll = (event) => {
      chatAtlasRevealConsumeInternalMovement('scroll');
      chatAtlasRevealRecordSupersessionAttempt('scroll-observed', {
        eventType: 'scroll', trusted: event?.isTrusted === true,
      });
      chatAtlasRevealState.supersessionReason = 'ignored-not-user-intent';
      // A movement signal is not intent, but it IS a reason to look again.
      try { chatAtlasRevealReconcileTick('scroll'); } catch {}
    };
    // A pointer press is scrollbar intent only in the gutter, not anywhere in
    // the conversation body.
    const onPointer = (event) => {
      let armed = false;
      try {
        const rect = container.getBoundingClientRect?.();
        const x = Number(event?.clientX);
        armed = !!rect && Number.isFinite(x)
          && (x - Number(rect.left || 0)) > Number(container.clientWidth || 0);
      } catch { armed = false; }
      if (!armed) {
        chatAtlasRevealRecordSupersessionAttempt('pointer-in-content', {
          eventType: 'pointerdown', trusted: event?.isTrusted === true, pointerScrollArmed: false,
        });
        chatAtlasRevealState.supersessionReason = 'ignored-not-user-intent';
        return;
      }
      chatAtlasRevealSupersede('scrollbar-pointer', {
        eventType: 'pointerdown', trusted: event?.isTrusted === true, pointerScrollArmed: true,
      });
    };
    const onKey = (event) => {
      const key = String(event?.key || '');
      if (![
        'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar',
      ].includes(key)) return;
      chatAtlasRevealSupersede('user-key', { eventType: 'keydown', trusted: event?.isTrusted === true });
    };
    const add = (target, type, handler, options) => {
      if (!target?.addEventListener) return;
      try {
        target.addEventListener(type, handler, options);
        chatAtlasRevealState.listeners.push({ target, type, handler, options });
      } catch {}
    };
    const passive = { passive: true };
    add(container, 'wheel', onIntent('wheel'), passive);
    add(container, 'touchstart', onIntent('touchstart'), passive);
    add(container, 'touchmove', onIntent('touchmove'), passive);
    add(container, 'pointerdown', onPointer, passive);
    add(container, 'scroll', onScroll, passive);
    add(W, 'keydown', onKey, true);
    return chatAtlasRevealState.listeners.length;
  }

  function chatAtlasRevealOpenTransaction(target) {
    chatAtlasRevealClearListeners();
    const container = chatAtlasResolveConversationScrollContainer();
    if (!container.ok) {
      // The CALLER decides whether this is terminal or merely early: at boot
      // the conversation has not mounted yet, and that is not a failure.
      chatAtlasRevealState.reason = container.reason;
      return Object.freeze({ ok: false, reason: container.reason, container: null });
    }
    const token = `reveal:${String(completeTurnIndexAuthorityState.chatId || '')}:${Number(completeTurnIndexAuthorityState.generation || 0)}:${target?.qId || ''}`;
    chatAtlasRevealState.token = token;
    chatAtlasRevealState.pin = chatAtlasRevealCurrentPin(target);
    chatAtlasRevealState.superseded = false;
    chatAtlasRevealState.supersededBy = null;
    chatAtlasRevealState.attempts = 0;
    chatAtlasRevealState.topScrollExecuted = false;
    chatAtlasRevealState.restoreState = 'idle';
    chatAtlasRevealState.restoreReason = null;
    chatAtlasRevealState.transactionState = 'open';
    chatAtlasRevealState.reason = null;
    chatAtlasRevealInstallUserListeners(container.element);
    return Object.freeze({ ok: true, reason: null, token, container: container.element });
  }

  // Bookmark: canonical identity first, container scrollTop only as a fallback.
  function chatAtlasRevealCaptureBookmark(container) {
    const scrollTop = Number(container?.scrollTop || 0);
    const base = { kind: 'scroll-top', turnId: null, offset: 0, scrollTop, captured: true };
    let sections = [];
    try {
      sections = Array.from(container?.querySelectorAll?.('[data-testid^="conversation-turn-"]') || []);
    } catch { sections = []; }
    let containerTop = 0;
    try { containerTop = Number(container?.getBoundingClientRect?.().top || 0); } catch {}
    for (const section of sections) {
      let qEl = null;
      try { qEl = section.querySelector?.('[data-message-author-role="user"][data-message-id]') || null; } catch {}
      const qId = chatAtlasCompleteIndexIdentity(qEl?.getAttribute?.('data-message-id'));
      if (!qId) continue;
      // Measure the SAME element restoration resolves. Capturing the turn
      // section while restoring the inner message element made them disagree
      // by the section's leading layout — the observed 998 px miss.
      let top = null;
      try { top = Number(qEl.getBoundingClientRect?.().top); } catch { top = null; }
      if (!Number.isFinite(top)) continue;
      if (top - containerTop < -1) continue;
      base.kind = 'canonical-turn';
      base.turnId = qId;
      base.offset = Math.round(top - containerTop);
      break;
    }
    chatAtlasRevealState.bookmark = chatAtlasFreeze(base);
    return chatAtlasRevealState.bookmark;
  }

  const CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX = 2;

  function chatAtlasRevealRestore(container) {
    const record = (state, reason, method = null, targetId = null, offset = 0) => {
      chatAtlasRevealState.restoreState = state;
      chatAtlasRevealState.restoreReason = reason;
      chatAtlasRevealState.restoreMethod = method;
      chatAtlasRevealState.restoreTargetId = targetId;
      chatAtlasRevealState.restoreOffset = offset;
      return Object.freeze({ ok: state === 'restored', state, reason, method });
    };
    const bookmark = chatAtlasRevealState.bookmark;
    if (!bookmark) return record('skipped', 'reveal-bookmark-missing');
    if (chatAtlasRevealState.superseded === true) return record('skipped', 'restore-superseded');
    if (!chatAtlasRevealScopeValid()) return record('skipped', 'reveal-scope-drift');
    if (!container) return record('failed', 'reveal-container-unavailable');
    // Restoration is a viewport movement only: it never touches branch
    // authority, MiniMap navigation, flashing or manual-override state.
    chatAtlasRevealArmInternalMovement('restore-bookmark',
      Number(bookmark.scrollTop || 0), Number(container.scrollTop || 0));
    return chatAtlasRevealInternal(() => {
      if (bookmark.kind === 'canonical-turn' && bookmark.turnId) {
        const wanted = Number(bookmark.offset || 0);
        const resolve = () => {
          try {
            const all = Array.from(container.querySelectorAll?.(
              `[data-message-author-role="user"][data-message-id="${bookmark.turnId}"]`,
            ) || []);
            if (all.length > 1) return 'ambiguous';
            return all[0] || null;
          } catch { return null; }
        };
        const offsetOf = (el) => Number(el.getBoundingClientRect?.().top || 0)
          - Number(container.getBoundingClientRect?.().top || 0);
        const first = resolve();
        if (first === 'ambiguous') {
          chatAtlasRevealState.restoreCorrectionReason = 'canonical-anchor-ambiguous';
        } else if (first) {
          try {
            const requested = Number(container.scrollTop || 0) + (offsetOf(first) - wanted);
            chatAtlasRevealState.restoreRequestedScrollTop = requested;
            container.scrollTop = requested;
            chatAtlasRevealState.restoreFirstMeasuredScrollTop = Number(container.scrollTop || 0);
            // Verify against the ORIGINAL bookmark: layout may have shifted or
            // the browser's scroll anchoring may have moved the position.
            const again = resolve();
            const settled = again && again !== 'ambiguous' ? again : first;
            let measured = offsetOf(settled);
            let error = Math.round(measured - wanted);
            if (Math.abs(error) > CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX) {
              chatAtlasRevealState.restoreCorrectionAttempts = 1;
              chatAtlasRevealState.restoreCorrectionReason = 'offset-error-corrected';
              container.scrollTop = Number(container.scrollTop || 0) + error;
              measured = offsetOf(settled);
              error = Math.round(measured - wanted);
            }
            chatAtlasRevealState.restoreMeasuredOffset = Math.round(measured);
            chatAtlasRevealState.restoreOffsetError = error;
            chatAtlasRevealState.restoreFinalScrollTop = Number(container.scrollTop || 0);
            if (Math.abs(error) > CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX) {
              return record('failed', 'reveal-restore-failed', 'canonical-turn', bookmark.turnId, wanted);
            }
            return record('restored', null, 'canonical-turn', bookmark.turnId, wanted);
          } catch {
            return record('failed', 'reveal-restore-failed', 'canonical-turn', bookmark.turnId, wanted);
          }
        } else {
          chatAtlasRevealState.restoreCorrectionReason = 'canonical-anchor-missing';
        }
      }
      const wantedTop = Number(bookmark.scrollTop || 0);
      try {
        chatAtlasRevealState.restoreRequestedScrollTop = wantedTop;
        container.scrollTop = wantedTop;
        chatAtlasRevealState.restoreFirstMeasuredScrollTop = Number(container.scrollTop || 0);
        let error = Math.round(Number(container.scrollTop || 0) - wantedTop);
        if (Math.abs(error) > CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX) {
          chatAtlasRevealState.restoreCorrectionAttempts = 1;
          chatAtlasRevealState.restoreCorrectionReason = 'scroll-top-error-corrected';
          container.scrollTop = Number(container.scrollTop || 0) - error;
          error = Math.round(Number(container.scrollTop || 0) - wantedTop);
        }
        chatAtlasRevealState.restoreOffsetError = error;
        if (Math.abs(error) > CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX) {
          chatAtlasRevealState.restoreFinalScrollTop = Number(container.scrollTop || 0);
          return record('failed', 'reveal-restore-failed', 'scroll-top', null, wantedTop);
        }
      } catch {
        return record('failed', 'reveal-restore-failed', 'scroll-top', null, wantedTop);
      }
      chatAtlasRevealState.restoreFinalScrollTop = Number(container.scrollTop || 0);
      return record('restored', null, 'scroll-top', null, wantedTop);
    });
  }

  // Exact mounted-target proof. Requires the target question, a paired
  // assistant identity and an unambiguous regeneration pager owned by that
  // exact pair. Mounting some other early turn is never success.
  // ── Passive pager audit (Stage 2C-2ah3) ───────────────────────────────────
  // Read-only structural capture. It never activates anything and never keeps
  // a DOM reference: only content-free counts, enums and hashes survive, so
  // the picture stays readable after restoration re-virtualizes the turn.
  const CHAT_ATLAS_PAGER_AUDIT_MAX_CANDIDATES = 24;
  const CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS = Object.freeze(['previous', 'next', 'left', 'right']);
  // How far above an exact indicator we will look for controls before calling
  // them adjacent. A toolbar seven hops away is not a pager.
  const CHAT_ATLAS_PAGER_AUDIT_ADJACENCY_HOPS = 3;

  function chatAtlasPagerAuditHash(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return null;
    return `djb2:${chatAtlasCompleteIndexStableHash(text)}`;
  }

  function chatAtlasPagerAuditRegions(answerSection) {
    const regions = [];
    const push = (region, el) => regions.push({ region, el: el || null });
    push('answer-section', answerSection);
    push('answer-section-parent', answerSection?.parentElement || null);
    push('previous-sibling-section', answerSection?.previousElementSibling || null);
    push('following-sibling-section', answerSection?.nextElementSibling || null);
    let wrapper = null;
    try {
      wrapper = answerSection?.parentElement?.closest?.('[data-testid^="conversation-turn-"]') || null;
    } catch { wrapper = null; }
    if (wrapper && wrapper !== answerSection) push('conversation-turn-wrapper', wrapper);
    return regions;
  }

  function chatAtlasPagerAuditCandidate(node, region, targetAId, root) {
    const label = String(node?.getAttribute?.('aria-label') || '').trim().toLowerCase();
    const exactPrevious = label === 'previous response';
    const exactNext = label === 'next response';
    const directions = CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS.filter((word) => label.includes(word));
    let indicatorHops = -1;
    let group = node;
    for (let hop = 0; hop < 8 && group; hop += 1) {
      if (chatAtlasConvergenceExactIndicator(group)) { indicatorHops = hop; break; }
      group = group.parentElement || null;
    }
    let owner = null;
    let ownerMethod = 'none';
    try { owner = node.closest?.('[data-message-id]') || null; } catch {}
    if (owner) ownerMethod = 'closest-message-id';
    if (!owner && root) {
      let ordered = [];
      try { ordered = Array.from(root.querySelectorAll?.('[data-message-id], button') || []); } catch {}
      let last = null;
      for (const entry of ordered) {
        if (entry === node) break;
        if (chatAtlasCompleteIndexIdentity(entry?.getAttribute?.('data-message-id'))) last = entry;
      }
      if (last) { owner = last; ownerMethod = 'section-document-order'; }
    }
    if (!owner) {
      let sibling = null;
      try {
        sibling = node.closest?.('[data-testid^="conversation-turn-"]')
          ?.querySelector?.('[data-message-author-role="assistant"][data-message-id]') || null;
      } catch { sibling = null; }
      if (sibling) { owner = sibling; ownerMethod = 'sibling-assistant'; }
    }
    const ownerId = chatAtlasCompleteIndexIdentity(owner?.getAttribute?.('data-message-id')) || '';
    const ownerRole = String(owner?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase() || 'unknown';
    const ownerMatch = !owner
      ? 'unknown'
      : (ownerId === chatAtlasCompleteIndexIdentity(targetAId)
        ? 'target-answer'
        : (ownerRole === 'user' ? 'question' : 'other-answer'));
    let rejection = 'accepted-current-contract';
    if (!exactPrevious && !exactNext) rejection = 'label-not-recognized';
    else if (region !== 'answer-section') rejection = 'outside-current-search-root';
    else if (indicatorHops < 0) rejection = 'indicator-not-found';
    else if (!owner) rejection = 'owner-not-found';
    else if (ownerRole !== 'assistant') rejection = 'owner-role-not-assistant';
    else if (ownerMatch !== 'target-answer') rejection = 'owner-id-mismatch';
    return Object.freeze({
      region,
      tag: String(node?.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
      ariaLabelHash: chatAtlasPagerAuditHash(node?.getAttribute?.('aria-label')),
      testIdHash: chatAtlasPagerAuditHash(node?.getAttribute?.('data-testid')),
      role: String(node?.getAttribute?.('role') || '').trim().toLowerCase() || null,
      exactPrevious,
      exactNext,
      directionWords: Object.freeze(directions),
      indicatorFound: indicatorHops >= 0,
      indicatorHops,
      disabled: node?.disabled === true || node?.getAttribute?.('aria-disabled') === 'true',
      ownerMethod,
      ownerMatch,
      ownerRole,
      rejection,
    });
  }

  function chatAtlasPagerAuditButtonLike(node) {
    if (!node || node.nodeType !== 1) return false;
    if (String(node.tagName || '').toUpperCase() === 'BUTTON') return true;
    return String(node.getAttribute?.('role') || '').trim().toLowerCase() === 'button';
  }

  // Content-free structural summary of ONE unique control. Every button-like
  // node is recorded, including ones with no aria-label, title, test id or
  // role — an unlabelled icon control must never silently disappear.
  function chatAtlasPagerAuditControl(node, ordinal, regions, targetAId, root) {
    const label = String(node?.getAttribute?.('aria-label') || '').trim();
    const title = String(node?.getAttribute?.('title') || '').trim();
    const testId = String(node?.getAttribute?.('data-testid') || '').trim();
    const lower = label.toLowerCase();
    const exactPrevious = lower === 'previous response';
    const exactNext = lower === 'next response';
    let svg = false;
    let childCount = 0;
    try {
      childCount = Number(node?.children?.length || 0);
      svg = Array.from(node?.querySelectorAll?.('*') || [])
        .some((n) => String(n?.tagName || '').toLowerCase() === 'svg');
    } catch {}
    let indicatorHops = -1;
    let group = node;
    for (let hop = 0; hop < 8 && group; hop += 1) {
      if (chatAtlasConvergenceExactIndicator(group)) { indicatorHops = hop; break; }
      group = group.parentElement || null;
    }
    let owner = null;
    let ownerMethod = 'none';
    try { owner = node.closest?.('[data-message-id]') || null; } catch {}
    if (owner) ownerMethod = 'closest-message-id';
    if (!owner && root) {
      let ordered = [];
      try { ordered = Array.from(root.querySelectorAll?.('[data-message-id], button, [role="button"]') || []); } catch {}
      let last = null;
      for (const entry of ordered) {
        if (entry === node) break;
        if (chatAtlasCompleteIndexIdentity(entry?.getAttribute?.('data-message-id'))) last = entry;
      }
      if (last) { owner = last; ownerMethod = 'section-document-order'; }
    }
    if (!owner) {
      try {
        owner = node.closest?.('[data-testid^="conversation-turn-"]')
          ?.querySelector?.('[data-message-author-role="assistant"][data-message-id]') || null;
      } catch { owner = null; }
      if (owner) ownerMethod = 'sibling-assistant';
    }
    const ownerId = chatAtlasCompleteIndexIdentity(owner?.getAttribute?.('data-message-id')) || '';
    const ownerRole = String(owner?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase() || 'unknown';
    const ownerMatch = !owner
      ? 'unknown'
      : (ownerId === chatAtlasCompleteIndexIdentity(targetAId)
        ? 'target-answer'
        : (ownerRole === 'user' ? 'question' : 'other-answer'));
    return Object.freeze({
      ordinal,
      regions: Object.freeze(regions.slice()),
      tag: String(node?.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
      disabled: node?.disabled === true || node?.getAttribute?.('aria-disabled') === 'true',
      ariaLabelPresent: !!label,
      ariaLabelHash: chatAtlasPagerAuditHash(label),
      titlePresent: !!title,
      titleHash: chatAtlasPagerAuditHash(title),
      testIdPresent: !!testId,
      testIdHash: chatAtlasPagerAuditHash(testId),
      role: String(node?.getAttribute?.('role') || '').trim().toLowerCase() || null,
      svgChild: svg,
      childCount,
      exactPrevious,
      exactNext,
      directionWords: Object.freeze(CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS.filter((w) => lower.includes(w))),
      indicatorFound: indicatorHops >= 0,
      indicatorHops,
      ownerMethod,
      ownerMatch,
      ownerRole,
      hasAnyLabelSignal: !!(label || title || testId),
    });
  }

  function chatAtlasPagerAuditStructuralTag(node) {
    if (!node) return null;
    return String(node.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null;
  }

  function chatAtlasRevealAuditPager(row) {
    const targetAId = chatAtlasCompleteIndexIdentity(row?.mountedAId);
    const answerSection = row?.answerSection || row?.section || null;
    if (!answerSection || !targetAId) {
      chatAtlasRevealState.pagerAudit = chatAtlasFreeze({
        state: 'skipped', reason: 'audit-target-unavailable',
        targetMounted: !!row?.mountedQId, assistantMounted: !!targetAId,
        regions: [], controls: [], indicators: [], adjacent: [], totals: {},
        failureClass: 'insufficient-pager-structure',
      });
      return chatAtlasRevealState.pagerAudit;
    }
    // ── Deduplicate by DOM node identity across overlapping regions ────────
    const byNode = new Map();
    const regions = [];
    let rawOccurrences = 0;
    for (const { region, el } of chatAtlasPagerAuditRegions(answerSection)) {
      let buttons = [];
      let indicators = 0;
      if (el) {
        try { buttons = Array.from(el.querySelectorAll?.('*') || []).filter(chatAtlasPagerAuditButtonLike); } catch { buttons = []; }
        try {
          indicators = Array.from(el.querySelectorAll?.('*') || [])
            .filter((n) => /^\d+\s*\/\s*\d+$/.test(String(n?.textContent || '').trim())).length;
        } catch { indicators = 0; }
      }
      for (const node of buttons) {
        rawOccurrences += 1;
        const entry = byNode.get(node) || { node, regions: [], root: el };
        if (!entry.regions.includes(region)) entry.regions.push(region);
        if (region === 'answer-section') entry.root = el;
        byNode.set(node, entry);
      }
      regions.push(Object.freeze({
        region, present: !!el, buttonCount: buttons.length, indicatorCount: indicators,
      }));
    }
    const uniqueNodes = Array.from(byNode.values()).slice(0, CHAT_ATLAS_PAGER_AUDIT_MAX_CANDIDATES);
    const ordinalOf = new Map();
    const controls = uniqueNodes.map((entry, index) => {
      ordinalOf.set(entry.node, index);
      return chatAtlasPagerAuditControl(entry.node, index, entry.regions, targetAId, entry.root || answerSection);
    });

    // ── Exact indicators and the controls genuinely grouped with them ──────
    const indicatorNodes = [];
    const seenIndicator = new Set();
    for (const { region, el } of chatAtlasPagerAuditRegions(answerSection)) {
      if (!el) continue;
      let all = [];
      try { all = Array.from(el.querySelectorAll?.('*') || []); } catch { all = []; }
      for (const n of all) {
        if (seenIndicator.has(n)) continue;
        if (!/^\d+\s*\/\s*\d+$/.test(String(n?.textContent || '').trim())) continue;
        if (Number(n?.children?.length || 0) > 0) continue;   // innermost only
        seenIndicator.add(n);
        indicatorNodes.push({ node: n, region });
      }
    }
    const adjacent = [];
    const adjacentNodes = new Set();
    const indicators = indicatorNodes.map((entry, index) => {
      const node = entry.node;
      const parent = node.parentElement || null;
      const siblings = parent?.children || [];
      const indexInParent = Array.prototype.indexOf.call(siblings, node);
      // Smallest ancestor, within a bounded hop count, that actually contains
      // button-like controls. A numeric element seven hops from a toolbar is
      // NOT adjacency.
      let group = parent;
      let groupHops = 1;
      let groupButtons = [];
      for (let hop = 0; hop < CHAT_ATLAS_PAGER_AUDIT_ADJACENCY_HOPS && group; hop += 1) {
        let found = [];
        try { found = Array.from(group.querySelectorAll?.('*') || []).filter(chatAtlasPagerAuditButtonLike); } catch { found = []; }
        if (found.length) { groupButtons = found; groupHops = hop + 1; break; }
        group = group.parentElement || null;
      }
      let parentButtons = [];
      try { parentButtons = Array.from(parent?.querySelectorAll?.('*') || []).filter(chatAtlasPagerAuditButtonLike); } catch {}
      let resolverHops = -1;
      let probe = node;
      for (let hop = 0; hop < 8 && probe; hop += 1) {
        if (chatAtlasConvergenceExactIndicator(probe)) { resolverHops = hop; break; }
        probe = probe.parentElement || null;
      }
      for (const btn of groupButtons) {
        if (adjacentNodes.has(btn)) continue;
        adjacentNodes.add(btn);
        const btnIndex = Array.prototype.indexOf.call(siblings, btn);
        let position = 'other';
        try {
          if (node.contains?.(btn)) position = 'descendant';
          else if (btnIndex >= 0 && indexInParent >= 0) position = btnIndex < indexInParent ? 'before-indicator' : 'after-indicator';
        } catch {}
        const control = controls.find((c) => c.ordinal === ordinalOf.get(btn)) || null;
        const label = String(btn?.getAttribute?.('aria-label') || '').trim().toLowerCase();
        adjacent.push(Object.freeze({
          indicatorOrdinal: index,
          buttonOrdinal: ordinalOf.has(btn) ? ordinalOf.get(btn) : -1,
          position,
          ariaLabelHash: chatAtlasPagerAuditHash(btn?.getAttribute?.('aria-label')),
          titleHash: chatAtlasPagerAuditHash(btn?.getAttribute?.('title')),
          testIdHash: chatAtlasPagerAuditHash(btn?.getAttribute?.('data-testid')),
          hasAnyLabelSignal: !!(btn?.getAttribute?.('aria-label') || btn?.getAttribute?.('title') || btn?.getAttribute?.('data-testid')),
          exactContractLabel: label === 'previous response' || label === 'next response',
          disabled: btn?.disabled === true,
          svgChild: control ? control.svgChild : false,
          ownerMatch: control ? control.ownerMatch : 'unknown',
          region: control && control.regions.includes('answer-section') ? 'answer-section' : (control?.regions?.[0] || entry.region),
          resolverRecognized: label === 'previous response' || label === 'next response',
        }));
      }
      return Object.freeze({
        ordinal: index,
        region: entry.region,
        tag: chatAtlasPagerAuditStructuralTag(node),
        parentTag: chatAtlasPagerAuditStructuralTag(parent),
        exactPattern: true,
        resolverHops,
        siblingCount: siblings.length,
        indexInParent,
        previousSiblingTag: chatAtlasPagerAuditStructuralTag(siblings[indexInParent - 1] || null),
        nextSiblingTag: chatAtlasPagerAuditStructuralTag(siblings[indexInParent + 1] || null),
        previousButtonOrdinal: (() => {
          for (let i = indexInParent - 1; i >= 0; i -= 1) {
            if (chatAtlasPagerAuditButtonLike(siblings[i]) && ordinalOf.has(siblings[i])) return ordinalOf.get(siblings[i]);
          }
          return -1;
        })(),
        nextButtonOrdinal: (() => {
          for (let i = indexInParent + 1; i < siblings.length; i += 1) {
            if (chatAtlasPagerAuditButtonLike(siblings[i]) && ordinalOf.has(siblings[i])) return ordinalOf.get(siblings[i]);
          }
          return -1;
        })(),
        parentButtonCount: parentButtons.length,
        groupButtonCount: groupButtons.length,
        groupHops,
      });
    });

    // The UNCHANGED resolver, for comparison only.
    let entries = [];
    try { entries = chatAtlasNativeVariantPagers(answerSection) || []; } catch { entries = []; }
    const owned = entries.filter((e) => e.kind === 'assistant-regeneration' && e.ownerId === targetAId);
    const distinctOwners = new Set(entries.map((e) => String(e.ownerId || ''))).size;

    // ── Aggregates on RAW structural evidence ─────────────────────────────
    const recognized = controls.filter((c) => c.exactPrevious || c.exactNext);
    const ownerMatched = controls.filter((c) => c.ownerMatch === 'target-answer');
    const adjacentLabelled = adjacent.filter((a) => a.hasAnyLabelSignal);
    const adjacentContract = adjacent.filter((a) => a.exactContractLabel);
    const adjacentInRoot = adjacent.filter((a) => a.region === 'answer-section');
    const adjacentOwned = adjacent.filter((a) => a.ownerMatch === 'target-answer');

    // ── Evidence-based classification, anchored on the INDICATOR ──────────
    // Generic toolbar buttons that merely share a distant ancestor with a
    // number are never treated as relabelled pager controls.
    let failureClass = 'insufficient-pager-structure';
    if (owned.length === 1) failureClass = 'pager-resolver-should-have-succeeded';
    else if (!indicators.length) failureClass = 'pager-indicator-absent';
    else if (!adjacent.length) failureClass = 'pager-controls-absent';
    else if (!adjacentLabelled.length) failureClass = 'pager-controls-unlabeled';
    else if (!adjacentInRoot.length) failureClass = 'pager-outside-answer-section';
    else if (!adjacentContract.length) failureClass = 'pager-label-contract-mismatch';
    else if (!adjacentOwned.length) failureClass = 'pager-ownership-contract-mismatch';
    else if (owned.length > 1 || distinctOwners > 1) failureClass = 'pager-resolver-ambiguity';

    chatAtlasRevealState.pagerAudit = chatAtlasFreeze({
      state: 'captured',
      reason: null,
      targetMounted: true,
      assistantMounted: true,
      regions: regions.slice(),
      controls: controls.slice(),
      indicators: indicators.slice(),
      adjacent: adjacent.slice(),
      totals: {
        regionCount: regions.length,
        rawButtonOccurrences: rawOccurrences,
        uniqueButtonCount: byNode.size,
        duplicateOccurrenceCount: Math.max(0, rawOccurrences - byNode.size),
        uniqueCandidateCount: controls.length,
        totalButtons: rawOccurrences,
        candidateCount: controls.length,
        recognizedLabelCount: recognized.length,
        indicatorCount: indicators.length,
        ownerMatchCount: ownerMatched.length,
        adjacentControlCount: adjacent.length,
        adjacentLabelledCount: adjacentLabelled.length,
        adjacentContractCount: adjacentContract.length,
        resolverEntryCount: entries.length,
        resolverOwnedCount: owned.length,
        resolverDistinctOwners: distinctOwners,
      },
      failureClass,
    });
    return chatAtlasRevealState.pagerAudit;
  }

  // ── Container-wide passive pager locator (Stage 2C-2ah5) ─────────────────
  // Widens the search from one section to the PROVEN conversation container
  // plus bounded overlay roots, and calibrates against any genuine pager that
  // exists elsewhere. Read-only: no clicks, focus, hover or scrolling.
  const CHAT_ATLAS_PAGER_LOCATOR_MAX_ITEMS = 40;
  const CHAT_ATLAS_PAGER_LOCATOR_NEAR_PX = 400;

  function chatAtlasPagerLocatorRect(el) {
    try {
      const r = el?.getBoundingClientRect?.();
      if (!r) return null;
      return {
        top: Math.round(Number(r.top || 0)),
        left: Math.round(Number(r.left || 0)),
        width: Math.round(Number(r.width || 0)),
        height: Math.round(Number(r.height || 0)),
      };
    } catch { return null; }
  }

  // Content-free shape of an icon: viewBox and ordered path hashes only.
  function chatAtlasPagerLocatorSvgSignature(node) {
    let svgs = [];
    try { svgs = Array.from(node?.querySelectorAll?.('*') || []).filter((n) => String(n?.tagName || '').toLowerCase() === 'svg'); } catch {}
    if (!svgs.length) return Object.freeze({ svgCount: 0, viewBoxHash: null, pathCount: 0, pathHashes: Object.freeze([]) });
    const svg = svgs[0];
    let paths = [];
    try { paths = Array.from(svg.querySelectorAll?.('*') || []).filter((n) => String(n?.tagName || '').toLowerCase() === 'path'); } catch {}
    return Object.freeze({
      svgCount: svgs.length,
      viewBoxHash: chatAtlasPagerAuditHash(svg.getAttribute?.('viewBox')),
      pathCount: paths.length,
      pathHashes: Object.freeze(paths.slice(0, 6).map((n) => chatAtlasPagerAuditHash(n.getAttribute?.('d')))),
    });
  }

  function chatAtlasPagerLocatorSignatureKey(sig) {
    return `${sig.viewBoxHash || ''}|${sig.pathCount}|${(sig.pathHashes || []).join(',')}`;
  }

  function chatAtlasPagerLocatorOwner(node, targetAId) {
    let owner = null;
    let method = 'none';
    try { owner = node.closest?.('[data-message-id]') || null; } catch {}
    if (owner) method = 'closest-message-id';
    if (!owner) {
      try {
        owner = node.closest?.('[data-testid^="conversation-turn-"]')
          ?.querySelector?.('[data-message-author-role="assistant"][data-message-id]') || null;
      } catch { owner = null; }
      if (owner) method = 'sibling-assistant';
    }
    const id = chatAtlasCompleteIndexIdentity(owner?.getAttribute?.('data-message-id')) || '';
    const role = String(owner?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase() || 'unknown';
    return Object.freeze({
      method,
      role,
      match: !owner ? 'unknown'
        : (id === chatAtlasCompleteIndexIdentity(targetAId) ? 'target-answer'
          : (role === 'user' ? 'question' : 'other-answer')),
    });
  }

  function chatAtlasPagerLocatorControl(node, ordinal, region, targetAId, targetRect) {
    const label = String(node?.getAttribute?.('aria-label') || '').trim();
    const lower = label.toLowerCase();
    const title = String(node?.getAttribute?.('title') || '').trim();
    const testId = String(node?.getAttribute?.('data-testid') || '').trim();
    const rect = chatAtlasPagerLocatorRect(node);
    const sig = chatAtlasPagerLocatorSvgSignature(node);
    const owner = chatAtlasPagerLocatorOwner(node, targetAId);
    return Object.freeze({
      ordinal,
      region,
      tag: String(node?.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
      ariaLabelPresent: !!label,
      ariaLabelHash: chatAtlasPagerAuditHash(label),
      titlePresent: !!title,
      titleHash: chatAtlasPagerAuditHash(title),
      testIdPresent: !!testId,
      testIdHash: chatAtlasPagerAuditHash(testId),
      exactContractLabel: lower === 'previous response' || lower === 'next response',
      directionWords: Object.freeze(CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS.filter((w) => lower.includes(w))),
      disabled: node?.disabled === true,
      svg: sig,
      signatureKey: sig.svgCount ? chatAtlasPagerLocatorSignatureKey(sig) : null,
      width: rect ? rect.width : 0,
      height: rect ? rect.height : 0,
      distanceFromTargetPx: rect && targetRect ? Math.abs(rect.top - targetRect.top) : -1,
      ownerMethod: owner.method,
      ownerRole: owner.role,
      ownerMatch: owner.match,
      resolverAccepts: lower === 'previous response' || lower === 'next response',
    });
  }

  function chatAtlasPagerLocatorCapture(row) {
    const targetAId = chatAtlasCompleteIndexIdentity(row?.mountedAId);
    const answerSection = row?.answerSection || row?.section || null;
    const resolved = chatAtlasResolveConversationScrollContainer();
    const container = resolved.ok ? resolved.element : null;
    const store = (payload) => {
      chatAtlasRevealState.pagerLocator = chatAtlasFreeze(payload);
      return chatAtlasRevealState.pagerLocator;
    };
    if (!container || !targetAId || !answerSection) {
      return store({
        state: 'skipped', reason: 'locator-scope-unavailable', conclusion: 'insufficient-live-evidence',
        controls: [], indicators: [], knownPagerSignatures: [], overlayCandidates: [], totals: {}, visibility: {},
      });
    }
    let targetAnswerEl = null;
    try { targetAnswerEl = answerSection.querySelector?.(`[data-message-author-role="assistant"][data-message-id="${targetAId}"]`) || null; } catch {}
    const targetRect = chatAtlasPagerLocatorRect(targetAnswerEl || answerSection);

    // ── Container-wide census, deduplicated by DOM node ───────────────────
    const byNode = new Map();
    const addNode = (node, region) => {
      const entry = byNode.get(node) || { node, region };
      byNode.set(node, entry);
      return entry;
    };
    let all = [];
    try { all = Array.from(container.querySelectorAll?.('*') || []); } catch { all = []; }
    const indicators = [];
    let occurrences = 0;
    for (const node of all) {
      if (chatAtlasPagerAuditButtonLike(node)) {
        occurrences += 1;
        addNode(node, answerSection.contains?.(node) ? 'answer-section' : 'conversation-container');
        continue;
      }
      if (Number(node?.children?.length || 0) > 0) continue;
      if (!/^\d+\s*\/\s*\d+$/.test(String(node?.textContent || '').trim())) continue;
      if (indicators.length >= CHAT_ATLAS_PAGER_LOCATOR_MAX_ITEMS) continue;
      const rect = chatAtlasPagerLocatorRect(node);
      const owner = chatAtlasPagerLocatorOwner(node, targetAId);
      indicators.push(Object.freeze({
        ordinal: indicators.length,
        region: answerSection.contains?.(node) ? 'answer-section' : 'conversation-container',
        tag: String(node?.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
        parentTag: String(node?.parentElement?.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
        ownerMatch: owner.match,
        ownerRole: owner.role,
        distanceFromTargetPx: rect && targetRect ? Math.abs(rect.top - targetRect.top) : -1,
      }));
    }
    // ── Calibration: any pager the UNCHANGED resolver accepts anywhere ─────
    const knownSignatures = [];
    let knownPagerCount = 0;
    let knownAssistantPagerCount = 0;
    let resolverButtonOccurrences = 0;
    let sections = [];
    try { sections = Array.from(container.querySelectorAll?.('[data-testid^="conversation-turn-"]') || []); } catch {}
    for (const section of sections) {
      let entries = [];
      try { entries = chatAtlasNativeVariantPagers(section) || []; } catch { entries = []; }
      for (const entry of entries) {
        // Any genuine pager calibrates the icon contract — a question-edit
        // pager carries the same chevrons as a regeneration pager. Recording
        // the kind keeps the two distinguishable without narrowing the sample.
        if (!entry.previous && !entry.next) continue;
        knownPagerCount += 1;
        if (entry.kind === 'assistant-regeneration') knownAssistantPagerCount += 1;
        const btn = entry.previous || entry.next;
        // Mission B item 6: every resolver entry feeds the one census. These
        // buttons were already seen by the container sweep, so the DOM-node
        // dedupe is what keeps each of them a single record.
        for (const node of [entry.previous, entry.next]) {
          if (!node) continue;
          resolverButtonOccurrences += 1;
          addNode(node, answerSection.contains?.(node) ? 'answer-section' : 'conversation-container');
        }
        const sig = chatAtlasPagerLocatorSvgSignature(btn);
        const rect = chatAtlasPagerLocatorRect(btn);
        if (knownSignatures.length >= CHAT_ATLAS_PAGER_LOCATOR_MAX_ITEMS) continue;
        knownSignatures.push(Object.freeze({
          ordinal: knownSignatures.length,
          kind: String(entry.kind || 'unknown'),
          ownerIsTarget: entry.ownerId === targetAId,
          labelHash: chatAtlasPagerAuditHash(btn?.getAttribute?.('aria-label')),
          svg: sig,
          signatureKey: sig.svgCount ? chatAtlasPagerLocatorSignatureKey(sig) : null,
          width: rect ? rect.width : 0,
          height: rect ? rect.height : 0,
          distanceFromTargetPx: rect && targetRect ? Math.abs(rect.top - targetRect.top) : -1,
        }));
      }
    }
    const controls = Array.from(byNode.values())
      .slice(0, CHAT_ATLAS_PAGER_LOCATOR_MAX_ITEMS)
      .map((e, i) => chatAtlasPagerLocatorControl(e.node, i, e.region, targetAId, targetRect));

    const knownKeys = new Set(knownSignatures.map((k) => k.signatureKey).filter(Boolean));
    const signatureMatches = controls.filter((c) => c.signatureKey && knownKeys.has(c.signatureKey));
    const unlabelledTarget = controls.filter((c) => !c.ariaLabelPresent && !c.titlePresent
      && !c.testIdPresent && c.svg.svgCount > 0 && c.ownerMatch === 'target-answer');
    const unlabelledMatch = unlabelledTarget.some((c) => c.signatureKey && knownKeys.has(c.signatureKey));
    const nearestKnown = knownSignatures.reduce((best, k) => (
      k.distanceFromTargetPx >= 0 && (best < 0 || k.distanceFromTargetPx < best) ? k.distanceFromTargetPx : best
    ), -1);

    // ── Bounded overlay roots only: parent and its direct siblings ─────────
    const overlayCandidates = [];
    const overlayRoots = [];
    const parent = container.parentElement || null;
    // Sibling roots first, each including itself: the most specific bounded
    // root wins, so a sibling overlay layer is never reported as the parent's.
    for (const sib of Array.from(parent?.children || [])) {
      if (sib === container) continue;
      if (overlayRoots.length >= 6) break;
      overlayRoots.push({ root: 'container-sibling', el: sib, self: true });
    }
    if (parent) overlayRoots.push({ root: 'container-parent', el: parent, self: false });
    const overlaySeen = new Set();
    for (const { root, el, self } of overlayRoots) {
      let nodes = [];
      try { nodes = Array.from(el.querySelectorAll?.('*') || []); } catch { nodes = []; }
      if (self) nodes = [el].concat(nodes);
      for (const node of nodes) {
        if (overlayCandidates.length >= CHAT_ATLAS_PAGER_LOCATOR_MAX_ITEMS) break;
        if (overlaySeen.has(node)) continue;
        overlaySeen.add(node);
        if (container.contains?.(node)) continue;
        let position = '';
        try { position = String(W.getComputedStyle?.(node)?.position || ''); } catch {}
        if (position !== 'fixed' && position !== 'absolute') continue;
        let indicatorCount = 0;
        let directional = 0;
        try {
          const inner = Array.from(node.querySelectorAll?.('*') || []);
          indicatorCount = inner.filter((n) => /^\d+\s*\/\s*\d+$/.test(String(n?.textContent || '').trim())).length;
          directional = inner.filter((n) => chatAtlasPagerAuditButtonLike(n)
            && CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS.some((w) => String(n.getAttribute?.('aria-label') || '').toLowerCase().includes(w))).length;
        } catch {}
        if (!indicatorCount && !directional) continue;
        const rect = chatAtlasPagerLocatorRect(node);
        const distance = rect && targetRect ? Math.abs(rect.top - targetRect.top) : -1;
        overlayCandidates.push(Object.freeze({
          ordinal: overlayCandidates.length,
          root,
          proximity: distance >= 0 && distance <= CHAT_ATLAS_PAGER_LOCATOR_NEAR_PX ? 'near-target' : 'far',
          indicatorCount,
          directionalCount: directional,
          ownerMatch: chatAtlasPagerLocatorOwner(node, targetAId).match,
          distanceFromTargetPx: distance,
        }));
      }
    }

    // ── Visibility / conditional-UI signals (read-only) ────────────────────
    const containerRect = chatAtlasPagerLocatorRect(container);
    const visible = targetRect && containerRect
      ? Math.max(0, Math.min(targetRect.top + targetRect.height, containerRect.top + containerRect.height)
        - Math.max(targetRect.top, containerRect.top))
      : 0;
    const matchesState = (el, sel) => { try { return el?.matches?.(sel) === true; } catch { return false; } };
    const visibility = Object.freeze({
      intersectsViewport: visible > 0,
      visiblePercent: targetRect && targetRect.height
        ? Math.max(0, Math.min(100, Math.round((visible / targetRect.height) * 100))) : 0,
      hovered: matchesState(targetAnswerEl, ':hover'),
      focusWithin: matchesState(targetAnswerEl, ':focus-within'),
      targetWidth: targetRect ? targetRect.width : 0,
      targetHeight: targetRect ? targetRect.height : 0,
      distanceFromViewportTopPx: targetRect && containerRect ? targetRect.top - containerRect.top : -1,
    });

    const targetControls = controls.filter((c) => c.ownerMatch === 'target-answer');
    const containerExactLabels = controls.filter((c) => c.exactContractLabel);
    const containerDirectional = controls.filter((c) => c.directionWords.length || c.exactContractLabel);
    const containerUnlabelledSvg = controls.filter((c) => !c.ariaLabelPresent && !c.titlePresent
      && !c.testIdPresent && c.svg.svgCount > 0);
    // Pager-shaped and BELONGS to the target, but sits outside the answer root
    // the resolver searches — the resolver would never see it.
    const targetPagerOutsideRoot = containerDirectional.filter((c) => c.ownerMatch === 'target-answer'
      && c.region !== 'answer-section');
    const overlayNearTarget = overlayCandidates.filter((o) => o.proximity === 'near-target'
      && (o.ownerMatch === 'target-answer' || o.ownerMatch === 'unknown'));
    // Pager-shaped and INSIDE the target's own answer section, yet ownership
    // resolution attributes it to some other message — a resolver mismatch.
    const misownedInsideRoot = containerDirectional.filter((c) => c.region === 'answer-section'
      && c.ownerMatch !== 'target-answer');
    // The unlabelled target button carries the exact icon geometry of a pager
    // the UNCHANGED resolver already accepts elsewhere: same control, wrong
    // (or absent) label contract. Never inferred from "has an SVG" alone.
    const signatureMismatch = knownKeys.size > 0 && unlabelledMatch;

    let conclusion = 'insufficient-live-evidence';
    if (targetPagerOutsideRoot.length || overlayNearTarget.length) {
      conclusion = 'pager-found-outside-target-root';
    } else if (misownedInsideRoot.length) {
      conclusion = 'pager-owner-resolution-mismatch';
    } else if (signatureMismatch) {
      conclusion = 'pager-contract-signature-mismatch';
    } else if (knownPagerCount > 0) {
      conclusion = 'pager-dom-absent-for-target';
    } else if (!containerExactLabels.length && !indicators.length) {
      conclusion = 'no-native-pager-calibration-available';
    }
    return store({
      state: 'captured',
      reason: null,
      conclusion,
      controls: controls.slice(),
      indicators: indicators.slice(),
      knownPagerSignatures: knownSignatures.slice(),
      overlayCandidates: overlayCandidates.slice(),
      visibility,
      totals: {
        rawButtonOccurrences: occurrences + resolverButtonOccurrences,
        resolverButtonOccurrences,
        uniqueButtonCount: byNode.size,
        containerIndicatorCount: indicators.length,
        containerExactLabelCount: containerExactLabels.length,
        containerDirectionalCount: containerDirectional.length,
        containerUnlabelledSvgCount: containerUnlabelledSvg.length,
        knownPagerCount,
        knownAssistantPagerCount,
        knownPagerSignatureCount: knownSignatures.length,
        targetNearbyControlCount: targetControls.length,
        targetOwnerMatchCount: targetControls.length,
        targetSignatureMatches: signatureMatches.length,
        unlabelledTargetSignatureMatch: unlabelledMatch,
        nearestKnownSignatureDistancePx: nearestKnown,
        overlayCandidateCount: overlayCandidates.length,
      },
    });
  }

  // ── Turn-2 graph eligibility audit (Stage 2C-2ah7) ───────────────────────
  // Publishes the sibling proof H2O ALREADY computes and discards. Read-only
  // with respect to the graph, the traversal, the branch vector and the
  // newest-created policy: every helper below is called, never redefined.
  const CHAT_ATLAS_TURN2_AUDIT_MAX_CHILDREN = 32;
  const CHAT_ATLAS_TURN2_AUDIT_MAX_POINTS = 32;

  let chatAtlasTurn2GraphAudit = null;

  // Distinguishes "absent" from "duplicated": the unique-node helper answers
  // null for both, and only one of them is an ambiguity.
  function chatAtlasTurn2AuditMatchCount(graph, id, productKey) {
    const wanted = chatAtlasCompleteIndexIdentity(id);
    if (!wanted) return 0;
    let count = 0;
    for (const node of graph?.nodes || []) {
      if (productKey && node?.[productKey] !== true) continue;
      if (chatAtlasCompleteIndexIdentity(node?.messageId) === wanted) count += 1;
    }
    return count;
  }

  function chatAtlasTurn2AuditNodeByMessageId(graph, id) {
    const wanted = chatAtlasCompleteIndexIdentity(id);
    if (!wanted) return null;
    const found = (graph?.nodes || [])
      .filter((node) => chatAtlasCompleteIndexIdentity(node?.messageId) === wanted);
    return found.length === 1 ? found[0] : null;
  }

  function chatAtlasTurn2AuditRole(node) {
    const role = String(node?.role || '').trim().toLowerCase();
    return ['user', 'assistant', 'system', 'tool'].includes(role) ? role : 'unknown';
  }

  // One assistant identity, described only by its relationship to the target
  // question. Nothing here re-implements traversal: branch-root resolution is
  // the existing chatAtlasConvergenceBranchRoot.
  function chatAtlasTurn2AuditAssistant(graph, byId, questionNode, answerRoots, id, chainNodeIds) {
    const matchCount = chatAtlasTurn2AuditMatchCount(graph, id, null);
    const node = chatAtlasTurn2AuditNodeByMessageId(graph, id);
    if (!node) {
      return Object.freeze({
        found: false, ambiguous: matchCount > 1, role: 'unknown',
        productAnswer: false, branchShellAlias: false, stopped: false, createTimePresent: false,
        parentIsTargetQuestion: false, directChildIndex: -1, reachableFromAnswerRoot: false,
        answerRootOrdinal: -1, graphPathContainsTargetQuestion: false,
        intermediateNodeBetweenQuestionAndIdentity: false, onCurrentNodeChain: false,
      });
    }
    const root = questionNode ? chatAtlasConvergenceBranchRoot(questionNode, node, byId) : null;
    const rootOrdinal = root ? answerRoots.findIndex((entry) => entry.nodeId === root.nodeId) : -1;
    const directChildIndex = questionNode
      ? (questionNode.childIds || []).indexOf(node.nodeId)
      : -1;
    let chain = [];
    try { chain = chatAtlasChainToRoot(byId, node) || []; } catch { chain = []; }
    const chainIds = new Set(chain.map((entry) => entry.nodeId));
    return Object.freeze({
      found: true,
      ambiguous: matchCount > 1,
      role: chatAtlasTurn2AuditRole(node),
      productAnswer: node.productAnswer === true,
      branchShellAlias: node.branchShellAlias === true,
      stopped: node.stopped === true,
      createTimePresent: chatAtlasGraphCreateTime(node) !== null,
      parentIsTargetQuestion: !!questionNode && node.parentId === questionNode.nodeId,
      directChildIndex,
      reachableFromAnswerRoot: rootOrdinal >= 0,
      answerRootOrdinal: rootOrdinal,
      graphPathContainsTargetQuestion: !!questionNode && chainIds.has(questionNode.nodeId),
      // A wrapper/alias sits between the question and this identity.
      intermediateNodeBetweenQuestionAndIdentity: !!root && root.nodeId !== node.nodeId,
      onCurrentNodeChain: chainNodeIds.has(node.nodeId),
    });
  }

  function chatAtlasCaptureTurn2GraphAudit() {
    const store = (payload) => {
      chatAtlasTurn2GraphAudit = chatAtlasFreeze(payload);
      return chatAtlasTurn2GraphAudit;
    };
    const blank = (reason) => store({
      state: 'skipped', reason,
      conclusion: 'insufficient-graph-evidence',
      policyRecommendation: 'no-policy-change-supported',
      question: { found: false, unique: false, directChildCount: 0, productUserChildCount: 0,
        productAnswerChildCount: 0, branchShellAliasChildCount: 0, stoppedChildCount: 0,
        answerRootCount: 0, questionVariantCount: 0, answerRootCountGreaterThanOne: false },
      children: [], current: null, defaultAnswer: null,
      defaultEligibility: { archive: false, presentation: false, nativeSibling: false,
        exclusionReason: 'insufficient-graph-evidence' },
      points: [], turn2Point: { found: false, kind: 'none', variantCount: 0, selectedIndex: -1,
        containsCurrent: false, containsDefault: false, containsBoth: false },
      pointer: { present: false, belongsToGraph: false, chainContainsQuestion: false,
        chainContainsCurrent: false, chainContainsDefault: false, agreesWithEffective: false },
    });

    const targetQId = chatAtlasCompleteIndexIdentity(chatAtlasDefaultOverlayState.revealTargetQId);
    const currentAId = chatAtlasCompleteIndexIdentity(chatAtlasDefaultOverlayState.revealTargetCurrentAId);
    const defaultAId = chatAtlasCompleteIndexIdentity(chatAtlasDefaultOverlayState.revealTargetExpectedAId);
    if (!targetQId || !currentAId || !defaultAId) return blank('audit-target-unresolved');
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return blank(scope.reason);
    const graph = scope.graph;
    const byId = scope.byId;

    // ── Mission F: the host's own pointer, proven through its chain ────────
    const pointerId = chatAtlasCompleteIndexIdentity(graph.currentNode);
    const pointerNode = pointerId ? byId.get(pointerId) || null : null;
    let pointerChain = [];
    if (pointerNode) {
      try { pointerChain = chatAtlasChainToRoot(byId, pointerNode) || []; } catch { pointerChain = []; }
    }
    const chainNodeIds = new Set(pointerChain.map((node) => node.nodeId));
    const chainMessageIds = new Set(pointerChain
      .map((node) => chatAtlasCompleteIndexIdentity(node.messageId))
      .filter(Boolean));
    let effectiveTurn2AId = '';
    try {
      const effective = getEffectivePresentationIndex();
      const row = (Array.isArray(effective?.turns) ? effective.turns : [])
        .find((turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === targetQId) || null;
      effectiveTurn2AId = chatAtlasCompleteIndexIdentity(row?.primaryAId) || '';
    } catch { effectiveTurn2AId = ''; }
    const pointer = Object.freeze({
      present: !!pointerId,
      belongsToGraph: !!pointerNode,
      chainContainsQuestion: chainMessageIds.has(targetQId),
      chainContainsCurrent: chainMessageIds.has(currentAId),
      chainContainsDefault: chainMessageIds.has(defaultAId),
      // Membership is the proof. Equality with graph.currentNode is not.
      agreesWithEffective: !!effectiveTurn2AId && chainMessageIds.has(effectiveTurn2AId),
    });

    // ── Mission C: the target question and its direct children ────────────
    const questionMatches = chatAtlasTurn2AuditMatchCount(graph, targetQId, 'productUser');
    const questionNode = chatAtlasConvergenceUniqueNode(graph, targetQId, 'productUser');
    const currentMatches = chatAtlasTurn2AuditMatchCount(graph, currentAId, null);
    const defaultMatches = chatAtlasTurn2AuditMatchCount(graph, defaultAId, null);
    const ambiguous = questionMatches > 1 || currentMatches > 1 || defaultMatches > 1;
    if (!questionNode && !ambiguous) return blank('target-question-unresolved');

    const answerRoots = questionNode
      ? chatAtlasConvergenceAnswerVariantRoots(questionNode, byId)
      : [];
    const questionVariants = questionNode
      ? chatAtlasConvergenceQuestionVariants(questionNode, byId)
      : [];
    const childNodes = (questionNode?.childIds || [])
      .map((childId) => byId.get(childId))
      .filter(Boolean);
    const children = childNodes.slice(0, CHAT_ATLAS_TURN2_AUDIT_MAX_CHILDREN).map((node, index) => {
      const resolved = chatAtlasAnswerIdentityForRoot(node, byId);
      const own = chatAtlasCompleteIndexIdentity(node.messageId) || '';
      return Object.freeze({
        ordinal: index,
        role: chatAtlasTurn2AuditRole(node),
        productUser: node.productUser === true,
        productAnswer: node.productAnswer === true,
        branchShellAlias: node.branchShellAlias === true,
        stopped: node.stopped === true,
        createTimePresent: chatAtlasGraphCreateTime(node) !== null,
        parentIsTargetQuestion: node.parentId === questionNode.nodeId,
        answerIdentityResolves: !!resolved,
        resolvedAnswerIsCurrent: !!resolved && resolved === currentAId,
        resolvedAnswerIsDefault: !!resolved && resolved === defaultAId,
        childIsCurrent: own === currentAId,
        childIsDefault: own === defaultAId,
      });
    });
    const question = Object.freeze({
      found: !!questionNode,
      unique: questionMatches === 1,
      directChildCount: childNodes.length,
      productUserChildCount: childNodes.filter((n) => n.productUser === true).length,
      productAnswerChildCount: childNodes.filter((n) => n.productAnswer === true).length,
      branchShellAliasChildCount: childNodes.filter((n) => n.branchShellAlias === true).length,
      stoppedChildCount: childNodes.filter((n) => n.stopped === true).length,
      answerRootCount: answerRoots.length,
      questionVariantCount: questionVariants.length,
      answerRootCountGreaterThanOne: answerRoots.length > 1,
    });

    // ── Mission D ─────────────────────────────────────────────────────────
    const current = chatAtlasTurn2AuditAssistant(graph, byId, questionNode, answerRoots, currentAId, chainNodeIds);
    const defaultAnswer = chatAtlasTurn2AuditAssistant(graph, byId, questionNode, answerRoots, defaultAId, chainNodeIds);

    // ── Mission E: summarise the EXISTING branch vector, unchanged ─────────
    // Membership is tested on the answer-branch ROOT that carries an identity,
    // which is what variantIds holds — a stopped or aliased variant is still a
    // root even when no product answer resolves beneath it.
    const rootIdFor = (node) => {
      if (!node || !questionNode) return '';
      const root = chatAtlasConvergenceBranchRoot(questionNode, node, byId);
      return root ? root.nodeId : '';
    };
    const currentRootId = rootIdFor(chatAtlasTurn2AuditNodeByMessageId(graph, currentAId));
    const defaultRootId = rootIdFor(chatAtlasTurn2AuditNodeByMessageId(graph, defaultAId));
    let computed = null;
    try { computed = chatAtlasComputeDefaultLatestCreatedPath(); } catch { computed = null; }
    const vector = computed?.ok === true && Array.isArray(computed.branchVector) ? computed.branchVector : [];
    const targetOrder = (() => {
      const turns = Array.isArray(computed?.turns) ? computed.turns : [];
      const row = turns.find((turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === targetQId) || null;
      return row ? Number(row.order || 0) : 0;
    })();
    const summarise = (point) => {
      const ids = Array.isArray(point?.variantIds) ? point.variantIds : [];
      const times = Array.isArray(point?.variantCreateTimes) ? point.variantCreateTimes : [];
      const selectedIndex = Number(point?.selectedIndex ?? -1);
      const selectedId = selectedIndex >= 0 ? String(ids[selectedIndex] || '') : '';
      const selectedTime = selectedIndex >= 0 ? times[selectedIndex] : null;
      return Object.freeze({
        order: Number(point?.order || 0),
        kind: String(point?.kind || 'none'),
        variantCount: Number(point?.variantCount || ids.length || 0),
        selectedIndex,
        selectedVariantCreateTimePresent: typeof selectedTime === 'number'
          && Number.isFinite(selectedTime) && selectedTime > 0,
        ownerIsTargetQuestion: chatAtlasCompleteIndexIdentity(point?.ownerMessageId) === targetQId,
        containsCurrent: !!currentRootId && ids.includes(currentRootId),
        containsDefault: !!defaultRootId && ids.includes(defaultRootId),
        selectedIsCurrent: !!currentRootId && selectedId === currentRootId,
        selectedIsDefault: !!defaultRootId && selectedId === defaultRootId,
      });
    };
    const points = vector.slice(0, CHAT_ATLAS_TURN2_AUDIT_MAX_POINTS).map(summarise);
    const turn2Raw = vector.find((point) => (
      String(point?.kind || '') === 'assistant-regeneration'
      && chatAtlasCompleteIndexIdentity(point?.ownerMessageId) === targetQId
      && (!targetOrder || Number(point?.order || 0) === targetOrder)
    )) || null;
    const turn2Summary = turn2Raw ? summarise(turn2Raw) : null;
    const turn2Point = Object.freeze({
      found: !!turn2Summary,
      kind: turn2Summary ? turn2Summary.kind : 'none',
      variantCount: turn2Summary ? turn2Summary.variantCount : 0,
      selectedIndex: turn2Summary ? turn2Summary.selectedIndex : -1,
      containsCurrent: !!turn2Summary && turn2Summary.containsCurrent,
      containsDefault: !!turn2Summary && turn2Summary.containsDefault,
      containsBoth: !!turn2Summary && turn2Summary.containsCurrent && turn2Summary.containsDefault,
    });

    // ── Mission D exclusion ladder and Mission G conclusion ────────────────
    const archiveEligible = defaultAnswer.found
      && (defaultAnswer.productAnswer || defaultAnswer.branchShellAlias);
    const structuralSibling = question.answerRootCountGreaterThanOne
      && current.reachableFromAnswerRoot
      && defaultAnswer.reachableFromAnswerRoot
      && current.answerRootOrdinal !== defaultAnswer.answerRootOrdinal;
    const nativeSibling = structuralSibling && turn2Point.containsBoth;

    let exclusionReason = 'none';
    if (ambiguous) exclusionReason = 'ambiguous-root';
    else if (!defaultAnswer.found) exclusionReason = 'node-not-found';
    else if (defaultAnswer.role !== 'assistant') exclusionReason = 'not-assistant';
    else if (!defaultAnswer.reachableFromAnswerRoot) {
      exclusionReason = defaultAnswer.graphPathContainsTargetQuestion
        ? 'not-resolved-from-answer-root'
        : 'parent-mismatch';
    } else if (!question.answerRootCountGreaterThanOne) exclusionReason = 'not-direct-child';
    else if (!turn2Point.containsBoth) exclusionReason = 'not-resolved-from-answer-root';
    else if (defaultAnswer.stopped) exclusionReason = 'stopped';
    else if (defaultAnswer.branchShellAlias) exclusionReason = 'branch-shell-alias';
    else if (!defaultAnswer.productAnswer) exclusionReason = 'not-assistant';

    const presentationEligible = nativeSibling && exclusionReason === 'none';

    let conclusion = 'insufficient-graph-evidence';
    if (ambiguous) conclusion = 'graph-identity-ambiguous';
    else if (!questionNode || !current.found || !defaultAnswer.found) {
      conclusion = 'insufficient-graph-evidence';
    } else if (!nativeSibling) conclusion = 'not-genuine-answer-siblings';
    else if (!presentationEligible) conclusion = 'sibling-target-not-presentation-eligible';
    else conclusion = 'genuine-eligible-answer-siblings';

    let policyRecommendation = 'no-policy-change-supported';
    if (conclusion === 'graph-identity-ambiguous') policyRecommendation = 'graph-ambiguous';
    else if (conclusion === 'genuine-eligible-answer-siblings') policyRecommendation = 'default-target-valid';
    else if (exclusionReason === 'branch-shell-alias') policyRecommendation = 'exclude-branch-shell-alias';
    else if (exclusionReason === 'stopped') policyRecommendation = 'exclude-stopped-answer';
    else if (structuralSibling && !turn2Point.containsBoth) policyRecommendation = 'require-branch-vector-membership';
    else if (['not-resolved-from-answer-root', 'parent-mismatch', 'not-direct-child'].includes(exclusionReason)) {
      policyRecommendation = 'require-direct-answer-sibling';
    }

    return store({
      state: 'captured',
      reason: null,
      conclusion,
      policyRecommendation,
      question,
      children,
      current,
      defaultAnswer,
      defaultEligibility: Object.freeze({
        archive: archiveEligible,
        presentation: presentationEligible,
        nativeSibling,
        exclusionReason,
      }),
      points,
      turn2Point,
      pointer,
    });
  }

  function chatAtlasRevealMeasureTarget(targetQId) {
    const wanted = chatAtlasCompleteIndexIdentity(targetQId);
    chatAtlasRevealState.mountedQId = null;
    chatAtlasRevealState.mountedAId = null;
    chatAtlasRevealState.pagerPresent = false;
    if (!wanted) return Object.freeze({ state: 'target-still-unmounted', reason: 'reveal-target-unproven' });
    let map = null;
    try { map = chatAtlasMapMountedNativePath(); } catch { map = null; }
    const rows = Array.isArray(map?.rows) ? map.rows : [];
    const matches = rows.filter((row) => row.mountedQId === wanted);
    if (!matches.length) return Object.freeze({ state: 'target-still-unmounted', reason: 'target-question-unmounted' });
    if (matches.length > 1) return Object.freeze({ state: 'target-mounted-ambiguous', reason: 'target-question-duplicated' });
    const row = matches[0];
    chatAtlasRevealState.mountedQId = row.mountedQId;
    if (!row.mountedAId) {
      return Object.freeze({ state: 'target-answer-unavailable', reason: 'target-answer-unmounted' });
    }
    // Passive structural capture at the exact moment the row is proven and
    // before restoration re-virtualizes it. Read-only; no DOM is retained.
    try { chatAtlasRevealAuditPager(row); } catch {}
    try { chatAtlasPagerLocatorCapture(row); } catch {}
    try { chatAtlasCaptureTurn2GraphAudit(); } catch {}
    // The pager must belong to THIS question/answer pair. Split user/assistant
    // sections are handled because the row carries its own answer section.
    let pagers = [];
    try { pagers = chatAtlasNativeVariantPagers(row.answerSection || row.section) || []; } catch { pagers = []; }
    const owned = pagers.filter((entry) => entry.kind === 'assistant-regeneration'
      && entry.ownerId === row.mountedAId);
    if (owned.length > 1) return Object.freeze({ state: 'target-mounted-ambiguous', reason: 'pager-owner-ambiguous' });
    chatAtlasRevealState.mountedAId = row.mountedAId;
    chatAtlasRevealState.pagerPresent = owned.length === 1;
    // The question and its answer ARE mounted. Calling that "still unmounted"
    // threw away proven evidence and misdescribed the terminal condition.
    if (!owned.length) {
      return Object.freeze({ state: 'target-mounted-pager-unavailable', reason: 'reveal-pager-unavailable' });
    }
    return Object.freeze({ state: 'target-mounted', reason: null });
  }

  // The action boundary. ENABLED: exactly one reversible movement of the proven
  // conversation container to its absolute top. No loop, no increments, no
  // second scroll — the attempt counter is the hard gate.
  const CHAT_ATLAS_REVEAL_ACTION_ENABLED = true;
  const CHAT_ATLAS_REVEAL_RECONCILE_TICKS = 3;

  function chatAtlasExecuteOneShotRevealAction(transaction) {
    if (CHAT_ATLAS_REVEAL_ACTION_ENABLED !== true) {
      chatAtlasRevealState.reason = 'reveal-action-disabled';
      return Object.freeze({ ok: false, executed: false, reason: 'reveal-action-disabled' });
    }
    if (!chatAtlasRevealScopeValid()) {
      return Object.freeze({ ok: false, executed: false, reason: 'reveal-scope-drift' });
    }
    if (chatAtlasRevealState.attempts >= 1 || chatAtlasRevealState.topScrollExecuted === true) {
      return Object.freeze({ ok: false, executed: false, reason: 'reveal-attempt-exhausted' });
    }
    const container = transaction?.container || null;
    if (!container) return Object.freeze({ ok: false, executed: false, reason: 'reveal-container-unavailable' });
    chatAtlasRevealState.attempts = 1;
    let moved = false;
    chatAtlasRevealArmInternalMovement('reveal-top', 0, Number(container.scrollTop || 0));
    chatAtlasRevealInternal(() => {
      try { container.scrollTop = 0; moved = true; } catch { moved = false; }
    });
    if (!moved) {
      return Object.freeze({ ok: false, executed: false, reason: 'reveal-produced-no-mount' });
    }
    chatAtlasRevealState.topScrollExecuted = true;
    chatAtlasRevealState.reconcileStartedAtNavigationMs = chatAtlasRevealNavigationMs();
    chatAtlasRevealState.reconcileState = 'reconciling';
    return Object.freeze({ ok: true, executed: true, reason: null });
  }

  // One bounded reveal: open, bookmark, one scroll, measure. The reconciliation
  // window is driven by the EXISTING authority notification, capped by ticks.
  const CHAT_ATLAS_REVEAL_READINESS_MAX = 3;
  // Scheduled late-boot probes are a RESERVED budget: boot-time authority
  // publications must never spend it. Five probes across ~8 s.
  // ABSOLUTE probe targets measured from the readiness start, so event-loop
  // delay cannot compound the schedule. Sparse across ~40 s: a conversation
  // can finish mounting far later than the old 8 s window allowed.
  // Post-scroll reconciliation targets, absolute from the top-scroll time. The
  // live trace saw the internal movement land 19.2 s after the scroll, so the
  // window reaches 30 s. Authority publications and scroll wakeups may
  // reconcile EARLIER but never spend this reserved budget.
  const CHAT_ATLAS_REVEAL_RECONCILE_TARGETS_MS = Object.freeze([
    100, 500, 1500, 3000, 6000, 12000, 20000, 30000,
  ]);
  const CHAT_ATLAS_REVEAL_RECONCILE_SCHEDULED_MAX = CHAT_ATLAS_REVEAL_RECONCILE_TARGETS_MS.length;
  const CHAT_ATLAS_REVEAL_RECONCILE_DEADLINE_MS = 30000;

  function chatAtlasRevealReconcileElapsedMs() {
    const frozen = Number(chatAtlasRevealState.reconcileTerminalElapsedMs || 0);
    if (frozen > 0) return frozen;
    const started = Number(chatAtlasRevealState.reconcileStartedAtNavigationMs || 0);
    if (!started) return 0;
    return Math.max(0, chatAtlasRevealNavigationMs() - started);
  }

  function chatAtlasRevealCancelReconcileRetry() {
    const handle = chatAtlasRevealState.reconcileRetryTask;
    chatAtlasRevealState.reconcileRetryTask = null;
    chatAtlasRevealState.reconcileRetryPending = false;
    if (handle == null) return false;
    try {
      if (typeof W.clearTimeout === 'function') W.clearTimeout(handle);
      else clearTimeout(handle);
    } catch {}
    return true;
  }

  function chatAtlasRevealScheduleReconcileRetry() {
    const st = chatAtlasRevealState;
    if (st.transactionState !== 'awaiting-mount') return false;
    if (st.reconcileRetryPending === true) return false;
    const spent = Number(st.reconcileScheduledProbes || 0);
    if (spent >= CHAT_ATLAS_REVEAL_RECONCILE_SCHEDULED_MAX) return false;
    const elapsed = chatAtlasRevealReconcileElapsedMs();
    if (elapsed >= CHAT_ATLAS_REVEAL_RECONCILE_DEADLINE_MS) return false;
    const target = CHAT_ATLAS_REVEAL_RECONCILE_TARGETS_MS[spent];
    const delay = Math.max(0, target - elapsed);
    const generation = Number(st.reconcileRetryGeneration || 0) + 1;
    st.reconcileRetryGeneration = generation;
    st.reconcileRetryPending = true;
    const schedule = typeof W.setTimeout === 'function'
      ? (fn, ms) => W.setTimeout(fn, ms)
      : (fn, ms) => setTimeout(fn, ms);
    st.reconcileRetryTask = schedule(() => {
      st.reconcileRetryTask = null;
      st.reconcileRetryPending = false;
      if (Number(st.reconcileRetryGeneration || 0) !== generation) return;
      if (st.transactionState !== 'awaiting-mount') return;
      try { chatAtlasRevealReconcileTick('scheduled'); } catch {}
    }, delay);
    return true;
  }

  const CHAT_ATLAS_REVEAL_READINESS_TARGETS_MS = Object.freeze([
    500, 1500, 3000, 6000, 10000, 16000, 24000, 34000, 40000,
  ]);
  const CHAT_ATLAS_REVEAL_READINESS_SCHEDULED_MAX = CHAT_ATLAS_REVEAL_READINESS_TARGETS_MS.length;
  const CHAT_ATLAS_REVEAL_READINESS_DEADLINE_MS = 40000;

  // Milliseconds since navigation, matching the trace's own basis.
  function chatAtlasRevealNavigationMs() {
    try {
      const value = W.performance && typeof W.performance.now === 'function'
        ? Number(W.performance.now())
        : NaN;
      if (Number.isFinite(value)) return Math.round(value);
    } catch {}
    return 0;
  }

  // Live while running; FROZEN once readiness reaches a terminal state, so a
  // later projection read cannot inflate it.
  function chatAtlasRevealReadinessElapsedMs() {
    const frozen = Number(chatAtlasRevealState.readinessTerminalElapsedMs || 0);
    if (frozen > 0) return frozen;
    const started = Number(chatAtlasRevealState.readinessStartedAtNavigationMs || 0);
    if (!started) return 0;
    return Math.max(0, chatAtlasRevealNavigationMs() - started);
  }

  function chatAtlasRevealFreezeReadiness(terminalState) {
    const st = chatAtlasRevealState;
    if (Number(st.readinessTerminalElapsedMs || 0) > 0) return false;
    const started = Number(st.readinessStartedAtNavigationMs || 0);
    st.readinessTerminalElapsedMs = started
      ? Math.max(1, chatAtlasRevealNavigationMs() - started)
      : 1;
    st.readinessTerminalState = terminalState;
    return true;
  }

  function chatAtlasRevealCancelReadinessRetry() {
    const handle = chatAtlasRevealState.readinessRetryTask;
    chatAtlasRevealState.readinessRetryTask = null;
    chatAtlasRevealState.readinessRetryPending = false;
    if (handle == null) return false;
    // Call through W so the receiver is preserved.
    try {
      if (typeof W.clearTimeout === 'function') W.clearTimeout(handle);
      else clearTimeout(handle);
    } catch {}
    return true;
  }

  // Authority notifications alone proved insufficient: the conversation can
  // finish mounting AFTER the last publication, leaving a pending readiness
  // transaction with a resolved container and nothing left to wake it. One
  // bounded, transaction-owned timeout closes that gap. It is not polling: it
  // is capped by revealReadinessCap and cancelled on every terminal path.
  function chatAtlasRevealScheduleReadinessRetry() {
    const st = chatAtlasRevealState;
    if (st.transactionState !== 'waiting-for-container-readiness') return false;
    if (st.readinessRetryPending === true) return false;         // no duplicates
    // Only SCHEDULED probes count against the reserved budget.
    const spent = Number(st.readinessScheduledProbes || 0);
    if (spent >= CHAT_ATLAS_REVEAL_READINESS_SCHEDULED_MAX) return false;
    const elapsed = chatAtlasRevealReadinessElapsedMs();
    if (elapsed >= CHAT_ATLAS_REVEAL_READINESS_DEADLINE_MS) return false;
    // Absolute target minus elapsed: a late timer does not push the rest out.
    const target = CHAT_ATLAS_REVEAL_READINESS_TARGETS_MS[spent];
    const delay = Math.max(0, target - elapsed);
    const generation = Number(st.readinessRetryGeneration || 0) + 1;
    st.readinessRetryGeneration = generation;
    st.readinessRetryDelayMs = delay;
    st.readinessRetryPending = true;
    st.readinessRetryScheduled = Number(st.readinessRetryScheduled || 0) + 1;
    const schedule = typeof W.setTimeout === 'function'
      ? (fn, ms) => W.setTimeout(fn, ms)
      : (fn, ms) => setTimeout(fn, ms);
    st.readinessRetryTask = schedule(() => {
      st.readinessRetryTask = null;
      st.readinessRetryPending = false;
      // A superseded or replaced transaction must not act.
      if (Number(st.readinessRetryGeneration || 0) !== generation) return;
      if (st.transactionState !== 'waiting-for-container-readiness') return;
      try { chatAtlasRevealRunOneShot(st.readinessTarget, 'scheduled'); } catch {}
    }, delay);
    return true;
  }

  function chatAtlasRevealRunOneShot(target, source = 'authority') {
    const st = chatAtlasRevealState;
    const waiting = st.transactionState === 'waiting-for-container-readiness';
    if (st.transactionState !== 'idle' && !waiting) {
      return Object.freeze({ ok: false, state: st.transactionState, reason: 'reveal-already-run' });
    }
    if (waiting) {
      // A pending readiness transaction is inert once its scope moved.
      if (!chatAtlasRevealScopeValid()) {
        chatAtlasRevealCancelReadinessRetry();
        chatAtlasRevealFreezeReadiness('superseded');
        st.readinessState = 'superseded';
        st.readinessReason = 'reveal-scope-drift';
        return chatAtlasRevealFinish('reveal-scope-drift', 'reveal-scope-drift');
      }
    } else {
      st.pin = chatAtlasRevealCurrentPin(target);
      st.readinessTarget = target;
      st.readinessStartedAtNavigationMs = chatAtlasRevealNavigationMs();
      st.readinessFirstResolvedAtNavigationMs = 0;
      st.readinessTerminalElapsedMs = 0;
      st.readinessTerminalState = null;
      st.readinessReadyElapsedMs = 0;
      st.readinessAttempts = 0;
      st.readinessAuthorityProbes = 0;
      st.readinessScheduledProbes = 0;
      st.readinessState = 'waiting';
      st.readinessReason = null;
      st.superseded = false;
      st.supersededBy = null;
    }
    // Readiness retries CONTAINER DISCOVERY ONLY. It never scrolls, never
    // captures a bookmark and never consumes the single scroll attempt.
    const probe = chatAtlasResolveConversationScrollContainer();
    if (!probe.ok) {
      st.readinessAttempts = Number(st.readinessAttempts || 0) + 1;
      if (source === 'scheduled') st.readinessScheduledProbes = Number(st.readinessScheduledProbes || 0) + 1;
      else st.readinessAuthorityProbes = Number(st.readinessAuthorityProbes || 0) + 1;
      st.readinessReason = probe.reason;
      // Only the reserved schedule can end the window — boot-time authority
      // noise never times readiness out.
      const budgetSpent = Number(st.readinessScheduledProbes || 0) >= CHAT_ATLAS_REVEAL_READINESS_SCHEDULED_MAX;
      const deadlineReached = chatAtlasRevealReadinessElapsedMs() >= CHAT_ATLAS_REVEAL_READINESS_DEADLINE_MS;
      if (budgetSpent || deadlineReached) {
        // One last look before giving up: a container that resolved between
        // the probe above and now must not be discarded.
        const finalProbe = chatAtlasResolveConversationScrollContainer();
        if (finalProbe.ok) {
          chatAtlasRevealCancelReadinessRetry();
          if (!st.readinessFirstResolvedAtNavigationMs) {
            st.readinessFirstResolvedAtNavigationMs = chatAtlasRevealNavigationMs();
          }
          chatAtlasRevealFreezeReadiness('ready');
          st.readinessReadyElapsedMs = Number(st.readinessTerminalElapsedMs || 0);
          st.readinessState = 'ready';
          st.readinessReason = null;
          st.transactionState = 'idle';
          const late = chatAtlasRevealOpenTransaction(target || st.readinessTarget);
          if (!late.ok) return chatAtlasRevealFinish('reveal-container-unavailable', late.reason);
          return chatAtlasRevealProceedAfterOpen(late);
        }
        chatAtlasRevealCancelReadinessRetry();
        chatAtlasRevealFreezeReadiness('timeout');
        st.readinessState = 'timeout';
        return chatAtlasRevealFinish('reveal-container-readiness-timeout', probe.reason);
      }
      st.readinessState = 'waiting';
      st.transactionState = 'waiting-for-container-readiness';
      // The final attempt must run even if no further notification arrives.
      chatAtlasRevealScheduleReadinessRetry();
      return Object.freeze({
        ok: false, state: 'waiting-for-container-readiness', reason: probe.reason,
        retryPending: st.readinessRetryPending === true,
      });
    }
    // Resolved: no retry may remain outstanding and no stale reason may linger.
    chatAtlasRevealCancelReadinessRetry();
    if (!st.readinessFirstResolvedAtNavigationMs) {
      st.readinessFirstResolvedAtNavigationMs = chatAtlasRevealNavigationMs();
    }
    chatAtlasRevealFreezeReadiness('ready');
    st.readinessReadyElapsedMs = Number(st.readinessTerminalElapsedMs || 0);
    st.readinessState = 'ready';
    st.readinessReason = null;
    st.transactionState = 'idle';
    const opened = chatAtlasRevealOpenTransaction(target || st.readinessTarget);
    if (!opened.ok) return chatAtlasRevealFinish('reveal-container-unavailable', opened.reason);
    return chatAtlasRevealProceedAfterOpen(opened);
  }

  function chatAtlasRevealProceedAfterOpen(opened) {
    chatAtlasRevealState.container = opened.container;
    chatAtlasRevealState.ticks = 0;
    chatAtlasRevealCaptureBookmark(opened.container);
    const action = chatAtlasExecuteOneShotRevealAction({ container: opened.container });
    if (action.executed !== true) {
      return chatAtlasRevealTerminate('reveal-container-unavailable', action.reason);
    }
    chatAtlasRevealState.transactionState = 'awaiting-mount';
    return chatAtlasRevealReconcileTick();
  }

  function chatAtlasRevealReconcileTick(source = 'authority') {
    // Supersession is checked FIRST: a user action already moved the state out
    // of 'awaiting-mount', and reporting a generic 'not awaiting' would hide
    // the precise terminal reason the contract requires.
    if (chatAtlasRevealState.superseded === true) {
      if (chatAtlasRevealState.transactionState === 'idle') {
        return Object.freeze({ ok: false, state: 'idle', reason: 'reveal-not-awaiting' });
      }
      return chatAtlasRevealTerminate('reveal-superseded-by-user-scroll', 'reveal-superseded-by-user-scroll');
    }
    if (chatAtlasRevealState.transactionState !== 'awaiting-mount') {
      return Object.freeze({ ok: false, state: chatAtlasRevealState.transactionState, reason: 'reveal-not-awaiting' });
    }
    const drift = chatAtlasRevealScopeDrift();
    chatAtlasRevealState.driftField = drift.field;
    chatAtlasRevealState.driftHard = drift.hard === true;
    if (drift.hard === true) {
      return chatAtlasRevealTerminate('reveal-scope-drift', `reveal-scope-drift:${drift.field}`);
    }
    // Only SCHEDULED probes spend the reserved budget; authority publications
    // and scroll wakeups reconcile opportunistically.
    if (source === 'scheduled') {
      chatAtlasRevealState.reconcileScheduledProbes = Number(chatAtlasRevealState.reconcileScheduledProbes || 0) + 1;
    } else if (source === 'scroll') {
      chatAtlasRevealState.reconcileScrollWakeups = Number(chatAtlasRevealState.reconcileScrollWakeups || 0) + 1;
    } else {
      chatAtlasRevealState.reconcileAuthorityProbes = Number(chatAtlasRevealState.reconcileAuthorityProbes || 0) + 1;
    }
    chatAtlasRevealState.reconcileLastProbeAtNavigationMs = chatAtlasRevealNavigationMs();
    // Soft churn keeps the ORIGINAL pinned target identities and keeps going.
    const container = chatAtlasRevealState.container || null;
    const pin = chatAtlasRevealState.pin;
    const measured = chatAtlasRevealMeasureTarget(pin?.targetQId);
    chatAtlasRevealState.ticks = Number(chatAtlasRevealState.ticks || 0) + 1;
    // Any conclusive measurement ends it; only a genuinely absent target waits.
    if (measured.state !== 'target-still-unmounted' && measured.state !== 'target-answer-unavailable') {
      chatAtlasRevealFreezeReconcile(measured.state);
      return chatAtlasRevealTerminate(measured.state, measured.reason);
    }
    const budgetSpent = Number(chatAtlasRevealState.reconcileScheduledProbes || 0)
      >= CHAT_ATLAS_REVEAL_RECONCILE_SCHEDULED_MAX;
    const deadlineReached = chatAtlasRevealReconcileElapsedMs() >= CHAT_ATLAS_REVEAL_RECONCILE_DEADLINE_MS;
    if (budgetSpent || deadlineReached) {
      // One final LIVE measurement: a stale earlier read must never decide it.
      const finalMeasured = chatAtlasRevealMeasureTarget(pin?.targetQId);
      chatAtlasRevealFreezeReconcile(finalMeasured.state);
      if (finalMeasured.state !== 'target-still-unmounted') {
        return chatAtlasRevealTerminate(finalMeasured.state, finalMeasured.reason);
      }
      return chatAtlasRevealTerminate(
        drift.soft === true ? 'reveal-soft-scope-drift-restored' : 'target-still-unmounted',
        finalMeasured.reason,
      );
    }
    // The lifecycle drives itself: nothing outside it needs to fire again.
    chatAtlasRevealScheduleReconcileRetry();
    return Object.freeze({ ok: false, state: 'awaiting-mount', reason: measured.reason });
  }

  function chatAtlasRevealDiagnostics() {
    const bookmark = chatAtlasRevealState.bookmark;
    return Object.freeze({
      revealState: String(chatAtlasRevealState.transactionState || 'idle'),
      revealReason: chatAtlasRevealState.reason,
      revealAttempts: Number(chatAtlasRevealState.attempts || 0),
      revealTransactionState: String(chatAtlasRevealState.transactionState || 'idle'),
      // Hashed, never raw: the token embeds chat and question identities, and
      // diagnostics stay content-free the same way the trusted-capture token
      // hash does.
      revealTransactionTokenHash: chatAtlasRevealState.token
        ? `djb2:${chatAtlasCompleteIndexStableHash(String(chatAtlasRevealState.token))}`
        : null,
      revealTransactionReason: chatAtlasRevealState.reason,
      revealTransactionScopeValid: chatAtlasRevealScopeValid(),
      revealTransactionSuperseded: chatAtlasRevealState.superseded === true,
      revealUserSuperseded: chatAtlasRevealState.superseded === true,
      revealTopScrollExecuted: chatAtlasRevealState.topScrollExecuted === true,
      revealListenerCount: chatAtlasRevealState.listeners.length,
      revealMountedQId: chatAtlasRevealState.mountedQId,
      revealMountedAId: chatAtlasRevealState.mountedAId,
      revealPagerPresent: chatAtlasRevealState.pagerPresent === true,
      revealBookmarkKind: bookmark?.kind || null,
      revealBookmarkTurnId: bookmark?.turnId || null,
      revealBookmarkOffset: Number(bookmark?.offset || 0),
      revealBookmarkScrollTop: Number(bookmark?.scrollTop || 0),
      revealBookmarkCaptured: bookmark?.captured === true,
      revealRestoreState: String(chatAtlasRevealState.restoreState || 'idle'),
      revealRestoreReason: chatAtlasRevealState.restoreReason,
      revealRestoreMethod: chatAtlasRevealState.restoreMethod,
      revealRestoreTargetId: chatAtlasRevealState.restoreTargetId,
      revealRestoreOffset: Number(chatAtlasRevealState.restoreOffset || 0),
      revealRestoreFinalScrollTop: Number(chatAtlasRevealState.restoreFinalScrollTop || 0),
      revealRestoreRequestedScrollTop: Number(chatAtlasRevealState.restoreRequestedScrollTop || 0),
      revealRestoreFirstMeasuredScrollTop: Number(chatAtlasRevealState.restoreFirstMeasuredScrollTop || 0),
      revealRestoreBookmarkOffset: Number(chatAtlasRevealState.bookmark?.offset || 0),
      revealRestoreMeasuredOffset: Number(chatAtlasRevealState.restoreMeasuredOffset || 0),
      revealRestoreOffsetError: Number(chatAtlasRevealState.restoreOffsetError || 0),
      revealRestoreCorrectionAttempts: Number(chatAtlasRevealState.restoreCorrectionAttempts || 0),
      revealRestoreCorrectionReason: chatAtlasRevealState.restoreCorrectionReason,
      revealRestoreTolerancePx: CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX,
      pagerAuditState: String(chatAtlasRevealState.pagerAudit?.state || 'idle'),
      pagerAuditReason: chatAtlasRevealState.pagerAudit?.reason || null,
      pagerAuditTargetMounted: chatAtlasRevealState.pagerAudit?.targetMounted === true,
      pagerAuditAssistantMounted: chatAtlasRevealState.pagerAudit?.assistantMounted === true,
      pagerAuditRegionCount: Number(chatAtlasRevealState.pagerAudit?.totals?.regionCount || 0),
      pagerAuditTotalButtons: Number(chatAtlasRevealState.pagerAudit?.totals?.totalButtons || 0),
      pagerAuditCandidateCount: Number(chatAtlasRevealState.pagerAudit?.totals?.candidateCount || 0),
      pagerAuditRecognizedLabelCount: Number(chatAtlasRevealState.pagerAudit?.totals?.recognizedLabelCount || 0),
      pagerAuditIndicatorCount: Number(chatAtlasRevealState.pagerAudit?.totals?.indicatorCount || 0),
      pagerAuditOwnerMatchCount: Number(chatAtlasRevealState.pagerAudit?.totals?.ownerMatchCount || 0),
      pagerAuditResolverEntryCount: Number(chatAtlasRevealState.pagerAudit?.totals?.resolverEntryCount || 0),
      pagerAuditResolverOwnedCount: Number(chatAtlasRevealState.pagerAudit?.totals?.resolverOwnedCount || 0),
      pagerAuditLikelyFailureClass: chatAtlasRevealState.pagerAudit?.failureClass || null,
      pagerAuditRawButtonOccurrences: Number(chatAtlasRevealState.pagerAudit?.totals?.rawButtonOccurrences || 0),
      pagerAuditUniqueButtonCount: Number(chatAtlasRevealState.pagerAudit?.totals?.uniqueButtonCount || 0),
      pagerAuditDuplicateOccurrenceCount: Number(chatAtlasRevealState.pagerAudit?.totals?.duplicateOccurrenceCount || 0),
      pagerAuditUniqueCandidateCount: Number(chatAtlasRevealState.pagerAudit?.totals?.uniqueCandidateCount || 0),
      pagerAuditAdjacentControlCount: Number(chatAtlasRevealState.pagerAudit?.totals?.adjacentControlCount || 0),
      pagerAuditAdjacentLabelledCount: Number(chatAtlasRevealState.pagerAudit?.totals?.adjacentLabelledCount || 0),
      pagerAuditAdjacentContractCount: Number(chatAtlasRevealState.pagerAudit?.totals?.adjacentContractCount || 0),
      pagerAuditRegions: chatAtlasRevealState.pagerAudit?.regions || [],
      pagerAuditControls: chatAtlasRevealState.pagerAudit?.controls || [],
      pagerAuditIndicators: chatAtlasRevealState.pagerAudit?.indicators || [],
      pagerAuditAdjacent: chatAtlasRevealState.pagerAudit?.adjacent || [],
      pagerLocatorState: String(chatAtlasRevealState.pagerLocator?.state || 'idle'),
      pagerLocatorReason: chatAtlasRevealState.pagerLocator?.reason || null,
      pagerLocatorConclusion: chatAtlasRevealState.pagerLocator?.conclusion || null,
      pagerLocatorContainerIndicatorCount: Number(chatAtlasRevealState.pagerLocator?.totals?.containerIndicatorCount || 0),
      pagerLocatorContainerExactLabelCount: Number(chatAtlasRevealState.pagerLocator?.totals?.containerExactLabelCount || 0),
      pagerLocatorContainerDirectionalCount: Number(chatAtlasRevealState.pagerLocator?.totals?.containerDirectionalCount || 0),
      pagerLocatorContainerUnlabelledSvgCount: Number(chatAtlasRevealState.pagerLocator?.totals?.containerUnlabelledSvgCount || 0),
      pagerLocatorKnownPagerCount: Number(chatAtlasRevealState.pagerLocator?.totals?.knownPagerCount || 0),
      pagerLocatorKnownPagerSignatureCount: Number(chatAtlasRevealState.pagerLocator?.totals?.knownPagerSignatureCount || 0),
      pagerLocatorTargetSignatureMatches: Number(chatAtlasRevealState.pagerLocator?.totals?.targetSignatureMatches || 0),
      pagerLocatorUnlabelledTargetSignatureMatch: chatAtlasRevealState.pagerLocator?.totals?.unlabelledTargetSignatureMatch === true,
      pagerLocatorNearestKnownSignatureDistancePx: Number(chatAtlasRevealState.pagerLocator?.totals?.nearestKnownSignatureDistancePx ?? -1),
      pagerLocatorTargetNearbyControlCount: Number(chatAtlasRevealState.pagerLocator?.totals?.targetNearbyControlCount || 0),
      pagerLocatorTargetOwnerMatchCount: Number(chatAtlasRevealState.pagerLocator?.totals?.targetOwnerMatchCount || 0),
      pagerLocatorOverlayCandidateCount: Number(chatAtlasRevealState.pagerLocator?.totals?.overlayCandidateCount || 0),
      pagerLocatorTargetHovered: chatAtlasRevealState.pagerLocator?.visibility?.hovered === true,
      pagerLocatorTargetFocusWithin: chatAtlasRevealState.pagerLocator?.visibility?.focusWithin === true,
      pagerLocatorTargetVisiblePercent: Number(chatAtlasRevealState.pagerLocator?.visibility?.visiblePercent || 0),
      pagerLocatorControls: chatAtlasRevealState.pagerLocator?.controls || [],
      pagerLocatorIndicators: chatAtlasRevealState.pagerLocator?.indicators || [],
      pagerLocatorKnownPagerSignatures: chatAtlasRevealState.pagerLocator?.knownPagerSignatures || [],
      pagerLocatorOverlayCandidates: chatAtlasRevealState.pagerLocator?.overlayCandidates || [],
      // ── Selected-chain / canonical pairing parity (Stage 2C-2ai1) ───────
      selectedChainPairingRule: 'canonical-last-product-answer',
      ...(() => {
        const parity = chatAtlasSelectedChainCanonicalParity();
        let computed = null;
        try { computed = chatAtlasComputeDefaultLatestCreatedPath(); } catch { computed = null; }
        const targetQId = chatAtlasCompleteIndexIdentity(chatAtlasDefaultOverlayState.revealTargetQId);
        const roots = Array.isArray(computed?.branchRoots) ? computed.branchRoots : [];
        const record = targetQId
          ? (roots.find((entry) => chatAtlasCompleteIndexIdentity(entry?.qId) === targetQId) || null)
          : (roots.find((entry) => Number(entry?.order || 0) === 2) || null);
        const canonical = chatAtlasCanonicalPresentationIndex();
        const canonicalRow = record
          ? (Array.isArray(canonical?.turns)
            ? canonical.turns.find((turn) => (
              chatAtlasCompleteIndexIdentity(turn?.qId) === chatAtlasCompleteIndexIdentity(record.qId)
            )) || null
            : null)
          : null;
        return {
          selectedChainTurn2BranchRootPresent: !!chatAtlasCompleteIndexIdentity(record?.branchRootAId),
          selectedChainTurn2BranchRootIsPrimary: record?.branchRootIsPrimary === true,
          selectedChainTurn2PrimaryAnswerResolved: !!chatAtlasCompleteIndexIdentity(record?.primaryAId),
          selectedChainTurn2PrimaryMatchesCanonical: !!record && !!canonicalRow
            && chatAtlasCompleteIndexIdentity(record.primaryAId)
              === chatAtlasCompleteIndexIdentity(canonicalRow.primaryAId),
          selectedChainCanonicalParity: parity.ok === true,
          selectedChainCanonicalParityReason: parity.reason || null,
          selectedChainCanonicalParityRows: Number(parity.comparedRows || 0),
          selectedChainCanonicalParityMismatches: Number(parity.mismatchCount || 0),
        };
      })(),
      // ── Graph-proven divergence and question-edit plan (Stage 2C-2ah8) ──
      graphDivergenceState: String(chatAtlasGraphDivergence().state || 'idle'),
      graphDivergenceReason: chatAtlasGraphDivergence().reason || null,
      graphDivergenceKind: chatAtlasGraphDivergence().kind || null,
      graphDivergenceOrder: Number(chatAtlasGraphDivergence().order || 0),
      graphDivergenceSharedPrefixLength: Number(chatAtlasGraphDivergence().sharedPrefixLength || 0),
      graphDivergenceOwnerFound: chatAtlasGraphDivergence().ownerFound === true,
      graphDivergenceOwnerRole: chatAtlasGraphDivergence().ownerRole || null,
      graphDivergenceOwnerMessageId: chatAtlasGraphDivergence().ownerMessageId || null,
      graphDivergenceCurrentRootFound: chatAtlasGraphDivergence().currentRootFound === true,
      graphDivergenceDefaultRootFound: chatAtlasGraphDivergence().defaultRootFound === true,
      graphDivergenceCurrentRootMessageId: chatAtlasGraphDivergence().currentRootMessageId || null,
      graphDivergenceDefaultRootMessageId: chatAtlasGraphDivergence().defaultRootMessageId || null,
      graphDivergenceVariantCount: Number(chatAtlasGraphDivergence().variantCount || 0),
      graphDivergenceCurrentIndex: Number(chatAtlasGraphDivergence().currentIndex ?? -1),
      graphDivergenceDefaultIndex: Number(chatAtlasGraphDivergence().defaultIndex ?? -1),
      graphDivergenceDirectAnswerSiblingProof: chatAtlasGraphDivergence().directAnswerSiblingProof === true,
      graphDivergenceQuestionVariantProof: chatAtlasGraphDivergence().questionVariantProof === true,
      graphDivergenceBranchVectorAgreement: chatAtlasGraphDivergence().branchVectorAgreement === true,
      defaultObservedDivergenceKind: chatAtlasDefaultOverlayState.observedDivergenceKind || null,
      defaultNativeRoute: chatAtlasDefaultOverlayState.nativeRoute || null,
      defaultAnswerConvergenceSuppressed: chatAtlasDefaultOverlayState.answerConvergenceSuppressed === true,
      defaultQuestionEditPlanState: String(chatAtlasQuestionEditPlanState.state || 'idle'),
      defaultQuestionEditPlanReason: chatAtlasQuestionEditPlanState.reason || null,
      defaultQuestionEditPagerOwnerProven: chatAtlasQuestionEditPlanState.plan?.pagerOwnerProven === true,
      defaultQuestionEditPreviousAvailable: chatAtlasQuestionEditPlanState.plan?.previousAvailable === true,
      defaultQuestionEditNextAvailable: chatAtlasQuestionEditPlanState.plan?.nextAvailable === true,
      defaultQuestionEditRequiredDirection: chatAtlasQuestionEditPlanState.plan?.requiredDirection || null,
      defaultQuestionEditVariantCount: Number(chatAtlasQuestionEditPlanState.plan?.variantCount || 0),
      defaultQuestionEditCurrentIndex: Number(chatAtlasQuestionEditPlanState.plan?.currentIndex ?? -1),
      defaultQuestionEditTargetIndex: Number(chatAtlasQuestionEditPlanState.plan?.targetIndex ?? -1),
      defaultQuestionEditActivationPermitted: chatAtlasQuestionEditPlanState.plan?.activationPermitted === true,
      defaultQuestionEditActivationCount: Number(chatAtlasQuestionEditPlanState.activations || 0),
      // ── Turn-2 graph eligibility audit (Stage 2C-2ah7) ──────────────────
      turn2GraphAuditState: String(chatAtlasTurn2GraphAudit?.state || 'idle'),
      turn2GraphAuditReason: chatAtlasTurn2GraphAudit?.reason || null,
      turn2GraphAuditConclusion: chatAtlasTurn2GraphAudit?.conclusion || null,
      turn2GraphAuditPolicyRecommendation: chatAtlasTurn2GraphAudit?.policyRecommendation || null,
      turn2QuestionFound: chatAtlasTurn2GraphAudit?.question?.found === true,
      turn2QuestionUnique: chatAtlasTurn2GraphAudit?.question?.unique === true,
      turn2DirectChildCount: Number(chatAtlasTurn2GraphAudit?.question?.directChildCount || 0),
      turn2AnswerRootCount: Number(chatAtlasTurn2GraphAudit?.question?.answerRootCount || 0),
      turn2QuestionVariantCount: Number(chatAtlasTurn2GraphAudit?.question?.questionVariantCount || 0),
      turn2CurrentAssistantFound: chatAtlasTurn2GraphAudit?.current?.found === true,
      turn2CurrentAssistantDirectChild: Number(chatAtlasTurn2GraphAudit?.current?.directChildIndex ?? -1) >= 0,
      turn2CurrentAssistantProductAnswer: chatAtlasTurn2GraphAudit?.current?.productAnswer === true,
      turn2CurrentAssistantBranchShellAlias: chatAtlasTurn2GraphAudit?.current?.branchShellAlias === true,
      turn2CurrentAssistantStopped: chatAtlasTurn2GraphAudit?.current?.stopped === true,
      turn2DefaultAssistantFound: chatAtlasTurn2GraphAudit?.defaultAnswer?.found === true,
      turn2DefaultAssistantDirectChild: Number(chatAtlasTurn2GraphAudit?.defaultAnswer?.directChildIndex ?? -1) >= 0,
      turn2DefaultAssistantProductAnswer: chatAtlasTurn2GraphAudit?.defaultAnswer?.productAnswer === true,
      turn2DefaultAssistantBranchShellAlias: chatAtlasTurn2GraphAudit?.defaultAnswer?.branchShellAlias === true,
      turn2DefaultAssistantStopped: chatAtlasTurn2GraphAudit?.defaultAnswer?.stopped === true,
      turn2DefaultAssistantArchiveEligible: chatAtlasTurn2GraphAudit?.defaultEligibility?.archive === true,
      turn2DefaultAssistantPresentationEligible: chatAtlasTurn2GraphAudit?.defaultEligibility?.presentation === true,
      turn2DefaultAssistantNativeSiblingEligible: chatAtlasTurn2GraphAudit?.defaultEligibility?.nativeSibling === true,
      turn2DefaultAssistantExclusionReason: chatAtlasTurn2GraphAudit?.defaultEligibility?.exclusionReason || null,
      turn2DefaultAssistantIntermediateNode:
        chatAtlasTurn2GraphAudit?.defaultAnswer?.intermediateNodeBetweenQuestionAndIdentity === true,
      turn2DefaultAssistantAnswerRootOrdinal: Number(chatAtlasTurn2GraphAudit?.defaultAnswer?.answerRootOrdinal ?? -1),
      turn2BranchVectorPointFound: chatAtlasTurn2GraphAudit?.turn2Point?.found === true,
      turn2BranchVectorKind: chatAtlasTurn2GraphAudit?.turn2Point?.kind || null,
      turn2BranchVectorVariantCount: Number(chatAtlasTurn2GraphAudit?.turn2Point?.variantCount || 0),
      turn2BranchVectorSelectedIndex: Number(chatAtlasTurn2GraphAudit?.turn2Point?.selectedIndex ?? -1),
      turn2BranchVectorContainsCurrent: chatAtlasTurn2GraphAudit?.turn2Point?.containsCurrent === true,
      turn2BranchVectorContainsDefault: chatAtlasTurn2GraphAudit?.turn2Point?.containsDefault === true,
      turn2BranchVectorContainsBoth: chatAtlasTurn2GraphAudit?.turn2Point?.containsBoth === true,
      turn2CurrentGraphPointerPresent: chatAtlasTurn2GraphAudit?.pointer?.present === true,
      turn2CurrentGraphPointerBelongs: chatAtlasTurn2GraphAudit?.pointer?.belongsToGraph === true,
      turn2CurrentGraphChainContainsQuestion: chatAtlasTurn2GraphAudit?.pointer?.chainContainsQuestion === true,
      turn2CurrentGraphChainContainsCurrentAssistant: chatAtlasTurn2GraphAudit?.pointer?.chainContainsCurrent === true,
      turn2CurrentGraphChainContainsDefaultAssistant: chatAtlasTurn2GraphAudit?.pointer?.chainContainsDefault === true,
      turn2CurrentGraphAgreesWithEffective: chatAtlasTurn2GraphAudit?.pointer?.agreesWithEffective === true,
      turn2GraphDirectChildren: chatAtlasTurn2GraphAudit?.children || [],
      turn2DefaultBranchVectorPoints: chatAtlasTurn2GraphAudit?.points || [],
      revealRestoreDelta: Math.round(
        Number(chatAtlasRevealState.restoreFinalScrollTop || 0)
        - Number(chatAtlasRevealState.bookmark?.scrollTop || 0),
      ),
      revealReconcileTicks: Number(chatAtlasRevealState.ticks || 0),
      revealReadinessState: String(chatAtlasRevealState.readinessState || 'idle'),
      revealReadinessReason: chatAtlasRevealState.readinessReason,
      revealReadinessAttempts: Number(chatAtlasRevealState.readinessAttempts || 0),
      revealReadinessCap: CHAT_ATLAS_REVEAL_READINESS_MAX,
      revealReadinessRetryScheduled: Number(chatAtlasRevealState.readinessRetryScheduled || 0),
      revealReadinessRetryPending: chatAtlasRevealState.readinessRetryPending === true,
      revealReadinessRetryDelayMs: Number(chatAtlasRevealState.readinessRetryDelayMs || 0),
      revealReadinessRetryGeneration: Number(chatAtlasRevealState.readinessRetryGeneration || 0),
      revealReadinessAuthorityProbes: Number(chatAtlasRevealState.readinessAuthorityProbes || 0),
      revealReadinessScheduledProbes: Number(chatAtlasRevealState.readinessScheduledProbes || 0),
      revealReadinessScheduledCap: CHAT_ATLAS_REVEAL_READINESS_SCHEDULED_MAX,
      revealReadinessElapsedMs: chatAtlasRevealReadinessElapsedMs(),
      revealReadinessStartedAtNavigationMs: Number(chatAtlasRevealState.readinessStartedAtNavigationMs || 0),
      revealReadinessFirstResolvedAtNavigationMs: Number(chatAtlasRevealState.readinessFirstResolvedAtNavigationMs || 0),
      revealReadinessReadyElapsedMs: Number(chatAtlasRevealState.readinessReadyElapsedMs || 0),
      revealReadinessTerminalElapsedMs: Number(chatAtlasRevealState.readinessTerminalElapsedMs || 0),
      revealReadinessTerminalState: chatAtlasRevealState.readinessTerminalState,
      revealSupersessionSource: chatAtlasRevealState.supersessionSource,
      revealSupersessionEventType: chatAtlasRevealState.supersessionEventType,
      revealSupersessionEventTrusted: chatAtlasRevealState.supersessionEventTrusted === true,
      revealSupersessionPhase: chatAtlasRevealState.supersessionPhase,
      revealSupersessionInternalDepth: Number(chatAtlasRevealState.supersessionInternalDepth || 0),
      revealSupersessionInternalExpectationActive: chatAtlasRevealState.supersessionInternalExpectationActive === true,
      revealSupersessionPointerScrollArmed: chatAtlasRevealState.supersessionPointerScrollArmed === true,
      revealSupersessionMsAfterTopScroll: Number(chatAtlasRevealState.supersessionMsAfterTopScroll || 0),
      revealSupersessionScrollTopBefore: Number(chatAtlasRevealState.supersessionScrollTopBefore || 0),
      revealSupersessionScrollTopAfter: Number(chatAtlasRevealState.supersessionScrollTopAfter || 0),
      revealSupersessionExpectedInternalTop: Number(chatAtlasRevealState.supersessionExpectedInternalTop || 0),
      revealSupersessionReason: chatAtlasRevealState.supersessionReason,
      revealReconcileState: String(chatAtlasRevealState.reconcileState || 'idle'),
      revealReconcileReason: chatAtlasRevealState.reconcileReason,
      revealReconcileAuthorityProbes: Number(chatAtlasRevealState.reconcileAuthorityProbes || 0),
      revealReconcileScrollWakeups: Number(chatAtlasRevealState.reconcileScrollWakeups || 0),
      revealReconcileScheduledProbes: Number(chatAtlasRevealState.reconcileScheduledProbes || 0),
      revealReconcileScheduledCap: CHAT_ATLAS_REVEAL_RECONCILE_SCHEDULED_MAX,
      revealReconcileStartedAtNavigationMs: Number(chatAtlasRevealState.reconcileStartedAtNavigationMs || 0),
      revealReconcileLastProbeAtNavigationMs: Number(chatAtlasRevealState.reconcileLastProbeAtNavigationMs || 0),
      revealReconcileTerminalElapsedMs: Number(chatAtlasRevealState.reconcileTerminalElapsedMs || 0),
      revealReconcileRetryPending: chatAtlasRevealState.reconcileRetryPending === true,
      revealReconcileDeadlineMs: CHAT_ATLAS_REVEAL_RECONCILE_DEADLINE_MS,
      revealReadinessDeadlineMs: CHAT_ATLAS_REVEAL_READINESS_DEADLINE_MS,
      revealScopeDriftField: chatAtlasRevealState.driftField,
      revealScopeDriftPhase: String(chatAtlasRevealState.transactionState || 'idle'),
      revealScopeHardInvalidation: chatAtlasRevealState.driftHard === true,
      revealScopeRestorePermitted: chatAtlasRevealRestorePermitted(),
      revealScopeDriftBeforeHash: chatAtlasRevealState.pin
        ? `djb2:${chatAtlasCompleteIndexStableHash(String(chatAtlasRevealState.pin.divergenceFingerprint || ''))}`
        : null,
      revealScopeDriftAfterHash: chatAtlasRevealState.pin
        ? `djb2:${chatAtlasCompleteIndexStableHash(String(chatAtlasRevealCurrentPin({
          order: chatAtlasRevealState.pin.targetOrder,
          qId: chatAtlasRevealState.pin.targetQId,
          currentAId: chatAtlasRevealState.pin.targetCurrentAId,
          expectedAId: chatAtlasRevealState.pin.targetExpectedAId,
        }).divergenceFingerprint || ''))}`
        : null,
      ...chatAtlasRevealContainerDiagnostics(),
    });
  }

  const chatAtlasDefaultOverlayState = {
    state: 'idle',
    reason: null,
    key: '',
    terminalNodeId: null,
    terminalCreateTime: null,
    pathCount: 0,
    fingerprint: '',
    branchVectorCount: 0,
    publications: 0,
    resolutions: 0,
    graphAcquisitions: 0,
    effectiveIdentity: '',
    samePathCheckRan: false,
    samePathResult: null,
    effectiveAvailableAtCheck: false,
    effectiveCountAtCheck: 0,
    firstDifference: null,
    deferrals: 0,
    resolutionSource: null,
    answerOnlyReason: null,
    convergenceAttempts: 0,
    convergenceSignature: '',
    convergenceReason: null,
    convergenceExpectedAId: null,
    convergenceExpectedQId: null,
    convergenceEvaluation: null,
    answerConvergenceSuppressed: false,
    nativeRoute: null,
    anchorOwnershipReason: null,
    observedDivergenceKind: null,
    revealTargetOrder: 0,
    revealTargetQId: null,
    revealTargetExpectedAId: null,
    revealTargetCurrentAId: null,
    revealTargetDivergenceKind: null,
    revealTargetReason: null,
    convergenceRecord: null,
  };

  function chatAtlasPathIdentityKey(turns) {
    return (Array.isArray(turns) ? turns : [])
      .map((turn) => `${Number(turn?.order || 0)}:${chatAtlasCompleteIndexIdentity(turn?.qId)}:${chatAtlasCompleteIndexIdentity(turn?.primaryAId) || ''}`)
      .join('|');
  }

  // Ordered identity equality. Deliberately NOT the fingerprint: that hash
  // also folds in answerVariants, and the graph-derived rows legitimately
  // carry the full variant set where the host canonical rows carry the host's
  // own. Two paths are the same selected route when these columns agree.
  // The first row whose identity columns disagree, for diagnostics. Returns
  // null when the two paths are the same selected route.
  function chatAtlasFirstPathIdentityDifference(left, right) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    if (a.length !== b.length) {
      return Object.freeze({ index: -1, field: 'length', left: a.length, right: b.length });
    }
    for (let i = 0; i < a.length; i += 1) {
      const cols = [
        ['order', Number(a[i]?.order || 0), Number(b[i]?.order || 0)],
        ['qId', chatAtlasCompleteIndexIdentity(a[i]?.qId), chatAtlasCompleteIndexIdentity(b[i]?.qId)],
        ['primaryAId', chatAtlasCompleteIndexIdentity(a[i]?.primaryAId), chatAtlasCompleteIndexIdentity(b[i]?.primaryAId)],
        ['noAnswer', a[i]?.noAnswer === true, b[i]?.noAnswer === true],
        ['stopped', a[i]?.stopped === true, b[i]?.stopped === true],
      ];
      for (const [field, l, r] of cols) {
        if (l !== r) return Object.freeze({ index: i, field, left: l, right: r });
      }
    }
    return null;
  }

  function chatAtlasSamePathIdentity(left, right) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    if (!a.length || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (
        Number(a[i]?.order || 0) !== Number(b[i]?.order || 0)
        || chatAtlasCompleteIndexIdentity(a[i]?.qId) !== chatAtlasCompleteIndexIdentity(b[i]?.qId)
        || chatAtlasCompleteIndexIdentity(a[i]?.primaryAId) !== chatAtlasCompleteIndexIdentity(b[i]?.primaryAId)
        || (a[i]?.noAnswer === true) !== (b[i]?.noAnswer === true)
        || (a[i]?.stopped === true) !== (b[i]?.stopped === true)
      ) return false;
    }
    return true;
  }

  function chatAtlasDefaultOverlayDiagnostics() {
    return Object.freeze({
      defaultOverlayState: String(chatAtlasDefaultOverlayState.state || 'idle'),
      defaultPublicationReason: chatAtlasDefaultOverlayState.reason,
      defaultTerminalId: chatAtlasDefaultOverlayState.terminalNodeId,
      defaultTerminalCreateTime: chatAtlasDefaultOverlayState.terminalCreateTime,
      defaultPathCount: Number(chatAtlasDefaultOverlayState.pathCount || 0),
      defaultPathFingerprint: String(chatAtlasDefaultOverlayState.fingerprint || ''),
      defaultBranchVectorCount: Number(chatAtlasDefaultOverlayState.branchVectorCount || 0),
      defaultPublications: Number(chatAtlasDefaultOverlayState.publications || 0),
      defaultResolutions: Number(chatAtlasDefaultOverlayState.resolutions || 0),
      defaultSamePathCheckRan: chatAtlasDefaultOverlayState.samePathCheckRan === true,
      defaultSamePathResult: chatAtlasDefaultOverlayState.samePathResult,
      defaultEffectiveAvailableAtCheck: chatAtlasDefaultOverlayState.effectiveAvailableAtCheck === true,
      defaultEffectiveCountAtCheck: Number(chatAtlasDefaultOverlayState.effectiveCountAtCheck || 0),
      defaultFirstDifference: chatAtlasDefaultOverlayState.firstDifference,
      defaultDedupKey: String(chatAtlasDefaultOverlayState.key || ''),
      defaultDeferrals: Number(chatAtlasDefaultOverlayState.deferrals || 0),
      defaultResolutionSource: chatAtlasDefaultOverlayState.resolutionSource,
      defaultAnswerOnlyReason: chatAtlasDefaultOverlayState.answerOnlyReason,
      defaultConvergenceAttempts: Number(chatAtlasDefaultOverlayState.convergenceAttempts || 0),
      defaultConvergenceReason: chatAtlasDefaultOverlayState.convergenceReason,
      defaultConvergenceExpectedAId: chatAtlasDefaultOverlayState.convergenceExpectedAId,
      defaultConvergenceExpectedQId: chatAtlasDefaultOverlayState.convergenceExpectedQId,
      defaultConvergenceEvaluation: chatAtlasDefaultOverlayState.convergenceEvaluation,
      revealTargetOrder: Number(chatAtlasDefaultOverlayState.revealTargetOrder || 0),
      revealTargetQId: chatAtlasDefaultOverlayState.revealTargetQId,
      revealTargetExpectedAId: chatAtlasDefaultOverlayState.revealTargetExpectedAId,
      revealTargetCurrentAId: chatAtlasDefaultOverlayState.revealTargetCurrentAId,
      revealTargetDivergenceKind: chatAtlasDefaultOverlayState.revealTargetDivergenceKind,
      revealTargetReason: chatAtlasDefaultOverlayState.revealTargetReason,
      ...chatAtlasRevealDiagnostics(),
      defaultEffectiveIdentity: String(chatAtlasDefaultOverlayState.effectiveIdentity || ''),
      defaultGraphAcquisitions: Number(chatAtlasDefaultOverlayState.graphAcquisitions || 0),
      manualOverrideActive: completeTurnIndexAuthorityState.manualOverrideActive === true,
      manualOverrideRevision: Number(completeTurnIndexAuthorityState.manualOverrideRevision || 0),
    });
  }

  // A manual selection owns the session from the moment it is captured. The
  // default origin is inert afterwards until a reload resets the session.
  function chatAtlasMarkManualBranchOverride(reason = 'manual-native-selection') {
    const state = completeTurnIndexAuthorityState;
    state.manualOverrideActive = true;
    state.manualOverrideRevision = Number(state.manualOverrideRevision || 0) + 1;
    state.manualOverrideChatId = String(state.chatId || '');
    state.manualOverrideRouteKey = String(state.routeKey || '');
    state.manualOverrideGeneration = Number(state.generation || 0);
    chatAtlasDefaultOverlayState.state = 'superseded';
    chatAtlasDefaultOverlayState.reason = reason;
    chatAtlasDefaultOverlayState.key = '';
    chatAtlasDefaultOverlayState.effectiveIdentity = '';
    chatAtlasDefaultOverlayState.convergenceRecord = null;
    chatAtlasDefaultOverlayState.convergenceSignature = '';
    chatAtlasDefaultOverlayState.convergenceReason = 'superseded-by-manual';
    try { chatAtlasRevealSupersede('manual-branch-selection'); } catch {}
    chatAtlasBranchTransactionTrace('default-superseded-by-manual', { reason });
  }

  // A route/generation change is a new page session for this purpose.
  function chatAtlasResetManualBranchOverride(reason = 'route-reset') {
    const state = completeTurnIndexAuthorityState;
    if (state.manualOverrideActive !== true) return;
    state.manualOverrideActive = false;
    state.manualOverrideRevision = 0;
    chatAtlasDefaultOverlayState.state = 'idle';
    chatAtlasDefaultOverlayState.reason = reason;
    chatAtlasDefaultOverlayState.key = '';
    chatAtlasDefaultOverlayState.effectiveIdentity = '';
  }

  // Every condition of the scoped exception, proven from the graph. Any single
  // failure means the route is NOT an answer-only difference and the general
  // containment rule applies unchanged.
  function chatAtlasDefaultAnswerOnlyDivergence(defaultTurns, canonicalTurns) {
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return Object.freeze({ ok: false, reason: scope.reason });
    const a = Array.isArray(defaultTurns) ? defaultTurns : [];
    const b = Array.isArray(canonicalTurns) ? canonicalTurns : [];
    if (!a.length || a.length !== b.length) return Object.freeze({ ok: false, reason: 'answer-only-length-differs' });
    const qIds = new Set();
    let differing = 0;
    for (let i = 0; i < a.length; i += 1) {
      const qId = chatAtlasCompleteIndexIdentity(a[i]?.qId);
      if (!qId || qIds.has(qId)) return Object.freeze({ ok: false, reason: 'answer-only-duplicate-question' });
      qIds.add(qId);
      if (
        Number(a[i]?.order || 0) !== Number(b[i]?.order || 0)
        || qId !== chatAtlasCompleteIndexIdentity(b[i]?.qId)
        || (a[i]?.noAnswer === true) !== (b[i]?.noAnswer === true)
        || (a[i]?.stopped === true) !== (b[i]?.stopped === true)
      ) return Object.freeze({ ok: false, reason: 'answer-only-row-mismatch' });
      const mine = chatAtlasCompleteIndexIdentity(a[i]?.primaryAId);
      const theirs = chatAtlasCompleteIndexIdentity(b[i]?.primaryAId);
      if (mine === theirs) continue;
      differing += 1;
      // The differing selection must be a PROVEN answer variant of that same
      // question in the retained graph.
      const questionNode = chatAtlasConvergenceUniqueNode(scope.graph, qId, 'productUser');
      if (!questionNode) return Object.freeze({ ok: false, reason: 'answer-only-question-unproven' });
      const identities = chatAtlasConvergenceAnswerVariantRoots(questionNode, scope.byId)
        .map((root) => chatAtlasAnswerIdentityForRoot(root, scope.byId));
      if (!mine || !identities.includes(mine)) {
        return Object.freeze({ ok: false, reason: 'answer-only-variant-unproven' });
      }
    }
    if (!differing) return Object.freeze({ ok: false, reason: 'answer-only-no-difference' });
    return Object.freeze({ ok: true, reason: null, differing });
  }

  // Preferred route when the newest-created default differs from the native
  // path only by answer selections: move the NATIVE content onto the default
  // answers using the existing identity-proven bounded convergence, then let
  // the host authority refresh settle. Nothing is published while native and
  // Core disagree, so the Core parity gate is never challenged.
  // Tri-state comparison of the mounted native path against a target route.
  // Absence of evidence is NEVER agreement: a target turn that is not mounted,
  // or is mounted without its assistant identity, yields 'unavailable'.
  // The exact branch owner at the FIRST ordered divergence between the target
  // route and the published effective path. This — not the first unmounted row
  // of the path — is what must be revealed and converged.
  function chatAtlasFirstDivergenceTarget(targetTurns) {
    const none = (why) => Object.freeze({
      ok: false, reason: why, order: 0, qId: null,
      expectedAId: null, currentAId: null, kind: null,
    });
    const turns = Array.isArray(targetTurns) ? targetTurns : [];
    if (!turns.length) return none('reveal-target-unproven');
    let effective = null;
    try { effective = getEffectivePresentationIndex(); } catch { effective = null; }
    const rows = Array.isArray(effective?.turns) ? effective.turns : [];
    if (!rows.length) return none('reveal-target-unproven');
    const shared = Math.min(turns.length, rows.length);
    for (let i = 0; i < shared; i += 1) {
      const qId = chatAtlasCompleteIndexIdentity(turns[i]?.qId);
      const theirQId = chatAtlasCompleteIndexIdentity(rows[i]?.qId);
      const aId = chatAtlasCompleteIndexIdentity(turns[i]?.primaryAId);
      const theirAId = chatAtlasCompleteIndexIdentity(rows[i]?.primaryAId);
      const sameShape = (turns[i]?.noAnswer === true) === (rows[i]?.noAnswer === true)
        && (turns[i]?.stopped === true) === (rows[i]?.stopped === true)
        && Number(turns[i]?.order || 0) === Number(rows[i]?.order || 0);
      if (qId === theirQId && aId === theirAId && sameShape) continue;
      return Object.freeze({
        ok: true,
        reason: null,
        order: Number(turns[i]?.order || 0),
        qId,
        expectedAId: aId || null,
        currentAId: theirAId || null,
        // The presentation rows only OBSERVE that a qId is shared. The native
        // control kind comes from the graph-proven branch edge; an unproven
        // graph never yields 'assistant-regeneration' here.
        observedSameQuestion: qId === theirQId,
        kind: chatAtlasGraphDivergence().kind === 'assistant-regeneration'
          ? 'assistant-regeneration'
          : 'question-edit',
      });
    }
    if (turns.length === rows.length) return none('reveal-target-identical');
    const i = shared;
    return Object.freeze({
      ok: true,
      reason: null,
      order: Number(turns[i]?.order || shared + 1),
      qId: chatAtlasCompleteIndexIdentity(turns[i]?.qId) || null,
      expectedAId: chatAtlasCompleteIndexIdentity(turns[i]?.primaryAId) || null,
      currentAId: null,
      kind: 'question-edit',
    });
  }

  function chatAtlasEvaluateNativeAgainstTarget(targetTurns) {
    const frozen = (result, why, mismatch = null, expected = null) => Object.freeze({
      result,
      reason: why,
      mismatch,
      expectedQId: expected?.qId || null,
      expectedPrimaryAId: expected?.primaryAId || null,
    });
    const turns = Array.isArray(targetTurns) ? targetTurns : [];
    if (!turns.length) return frozen('unavailable', 'target-path-empty');
    let map = null;
    try { map = chatAtlasMapMountedNativePath(); } catch { map = null; }
    const rows = Array.isArray(map?.rows) ? map.rows : [];
    if (!rows.length) {
      // Report the exact divergence owner. Falling back to the first path row
      // named a turn that does not diverge at all.
      const target = chatAtlasFirstDivergenceTarget(turns);
      return frozen('unavailable', 'native-path-unmounted', null, {
        qId: target.ok ? target.qId : null,
        primaryAId: target.ok ? target.expectedAId : null,
      });
    }
    // Rows are keyed by the question they mount, so a split user/assistant
    // topology pairs through chatAtlasMapMountedNativePath rather than through
    // an assumption that both roles share one section.
    const byQId = new Map();
    for (const row of rows) if (row.mountedQId) byQId.set(row.mountedQId, row);
    let firstUnavailable = null;
    for (const turn of turns) {
      const qId = chatAtlasCompleteIndexIdentity(turn?.qId);
      const aId = chatAtlasCompleteIndexIdentity(turn?.primaryAId);
      if (!qId) continue;
      const row = byQId.get(qId) || null;
      if (!row) {
        if (!firstUnavailable) {
          firstUnavailable = { reason: 'target-question-unmounted', qId, primaryAId: aId || null };
        }
        continue;
      }
      if (aId && !row.mountedAId) {
        if (!firstUnavailable) {
          firstUnavailable = { reason: 'target-answer-unmounted', qId, primaryAId: aId };
        }
        continue;
      }
      if (aId && row.mountedAId !== aId) {
        return frozen('mismatch', 'native-answer-differs', Object.freeze({
          section: row.answerSection || row.section,
          kind: 'assistant-regeneration',
          mountedQId: qId,
          mountedAId: row.mountedAId,
          expectedQId: qId,
          expectedPrimaryAId: aId,
          expectedOrder: Number(turn?.order || 0),
        }), { qId, primaryAId: aId });
      }
    }
    if (firstUnavailable) {
      return frozen('unavailable', firstUnavailable.reason, null, firstUnavailable);
    }
    return frozen('match', 'native-matches-target');
  }

  // ── Anchor branch ownership (Stage 2C-2ai1) ──────────────────────────────
  // The displayed answer is the LAST eligible answer in the turn window, so it
  // is generally NOT one of the question's direct variant-root ids. Requiring
  // that equality was the old `default-anchor-answer-not-variant` gate and it
  // is no longer the right question. What must hold instead: the row's branch
  // ROOT is one of the owner's variant roots, and the displayed answer lives
  // inside that same root's subtree.
  function chatAtlasProveAnchorBranchOwnership(computed, anchorIndex) {
    const fail = (reason) => Object.freeze({ ok: false, reason });
    const row = Array.isArray(computed?.turns) ? computed.turns[anchorIndex] : null;
    if (!row) return fail('anchor-row-missing');
    const roots = Array.isArray(computed?.branchRoots) ? computed.branchRoots : [];
    const record = roots.find((entry) => Number(entry?.order || 0) === Number(row.order || 0)) || null;
    if (!record) return fail('anchor-branch-root-unrecorded');
    const primaryAId = chatAtlasCompleteIndexIdentity(row.primaryAId);
    if (!primaryAId) return fail('anchor-answer-missing');
    if (chatAtlasCompleteIndexIdentity(record.primaryAId) !== primaryAId) {
      return fail('anchor-answer-row-mismatch');
    }
    const branchRootAId = chatAtlasCompleteIndexIdentity(record.branchRootAId);
    if (!branchRootAId) return fail('anchor-branch-root-missing');
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return fail(scope.reason);
    const questionNode = chatAtlasConvergenceUniqueNode(scope.graph, row.qId, 'productUser');
    if (!questionNode) return fail('anchor-question-ambiguous');
    // 1. the selected branch root belongs to the owner's variant-root set
    const rootNodes = chatAtlasConvergenceAnswerVariantRoots(questionNode, scope.byId);
    const selectedRoot = rootNodes.find((node) => (
      chatAtlasCompleteIndexIdentity(node.messageId) === branchRootAId
      || chatAtlasAnswerIdentityForRoot(node, scope.byId) === branchRootAId
    )) || null;
    if (!selectedRoot) return fail('anchor-branch-root-not-a-variant');
    // 2. the displayed answer resolves from THAT root
    if (record.branchRootIsPrimary !== true && record.displayResolvedFromBranchRoot !== true) {
      return fail('anchor-answer-not-resolved-from-root');
    }
    return Object.freeze({
      ok: true, reason: null, branchRootAId, primaryAId,
      branchRootIsPrimary: record.branchRootIsPrimary === true,
      rootCount: rootNodes.length,
    });
  }

  // Pairing parity between the selected-chain projection and the canonical
  // host-payload projection, on the columns production actually compares.
  function chatAtlasSelectedChainCanonicalParity() {
    const blank = (reason) => chatAtlasFreeze({
      ok: false, reason, comparedRows: 0, mismatchCount: 0, firstMismatchOrder: 0,
    });
    const canonical = chatAtlasCanonicalPresentationIndex();
    if (!Array.isArray(canonical?.turns) || !canonical.turns.length) return blank('canonical-unavailable');
    let computed = null;
    try { computed = chatAtlasComputeDefaultLatestCreatedPath(); } catch { computed = null; }
    if (computed?.ok !== true) return blank(computed?.reason || 'default-path-unavailable');
    const byQId = new Map(canonical.turns.map((turn) => [
      chatAtlasCompleteIndexIdentity(turn?.qId), turn,
    ]));
    let compared = 0;
    let mismatches = 0;
    let firstMismatchOrder = 0;
    for (const turn of computed.turns) {
      const canonicalRow = byQId.get(chatAtlasCompleteIndexIdentity(turn?.qId));
      if (!canonicalRow) continue;
      compared += 1;
      if (
        chatAtlasCompleteIndexIdentity(turn?.primaryAId)
        !== chatAtlasCompleteIndexIdentity(canonicalRow?.primaryAId)
      ) {
        mismatches += 1;
        if (!firstMismatchOrder) firstMismatchOrder = Number(turn?.order || 0);
      }
    }
    return chatAtlasFreeze({
      ok: compared > 0 && mismatches === 0,
      reason: compared === 0 ? 'no-shared-rows' : (mismatches ? 'primary-answer-mismatch' : null),
      comparedRows: compared,
      mismatchCount: mismatches,
      firstMismatchOrder,
    });
  }

  // ── Graph-proven divergence (Stage 2C-2ah8) ──────────────────────────────
  // The native control kind is decided by a real branch EDGE, never by two
  // presentation rows sharing a qId. `same qId + different primaryAId` survives
  // only as an observation and may not select a control type.
  const chatAtlasGraphDivergenceState = { key: '', value: null };

  function chatAtlasGraphDivergenceEmpty(state, reason) {
    return chatAtlasFreeze({
      state, reason, kind: null, order: 0, sharedPrefixLength: 0,
      ownerFound: false, ownerRole: null, ownerMessageId: null,
      currentRootFound: false, defaultRootFound: false,
      currentRootMessageId: null, defaultRootMessageId: null,
      variantCount: 0, currentIndex: -1, defaultIndex: -1, requiredDirection: null,
      directAnswerSiblingProof: false, questionVariantProof: false,
      branchVectorAgreement: false, observedKind: null,
      currentQuestionMessageId: null, defaultQuestionMessageId: null,
    });
  }

  // The point in a branch vector whose variant set literally contains this
  // root node. Matching on the root is exact for BOTH kinds: the node that
  // follows the shared owner on a chain IS that chain's variant root.
  function chatAtlasGraphDivergencePointFor(vector, rootNodeId) {
    if (!rootNodeId) return null;
    for (const point of vector || []) {
      const ids = Array.isArray(point?.variantIds) ? point.variantIds : [];
      if (ids.includes(rootNodeId)) return point;
    }
    return null;
  }

  function chatAtlasComputeGraphDivergence() {
    const fail = (reason) => chatAtlasGraphDivergenceEmpty('fail-closed', reason);
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return chatAtlasGraphDivergenceEmpty('waiting', scope.reason);
    const { graph, byId } = scope;
    const captureAtStart = String(selectedPathAcquisitionState.graph?.captureIdentity || '');

    // ── The two root-to-leaf chains ───────────────────────────────────────
    const currentNode = byId.get(chatAtlasCompleteIndexIdentity(graph.currentNode)) || null;
    if (!currentNode) return fail('current-node-unresolved');
    const currentChain = chatAtlasChainToRoot(byId, currentNode);
    if (!currentChain || !currentChain.length) return fail('current-chain-unresolved');
    const chosen = chatAtlasSelectLatestCreatedTerminal(graph, byId);
    if (!chosen.ok) return fail(chosen.reason || 'default-terminal-unresolved');
    const defaultChain = chatAtlasChainToRoot(byId, chosen.node);
    if (!defaultChain || !defaultChain.length) return fail('default-chain-unresolved');

    // ── Longest common graph-node prefix ──────────────────────────────────
    let prefix = 0;
    while (
      prefix < currentChain.length
      && prefix < defaultChain.length
      && currentChain[prefix].nodeId === defaultChain[prefix].nodeId
    ) prefix += 1;
    if (prefix === 0) return fail('chains-share-no-root');
    if (prefix >= currentChain.length && prefix >= defaultChain.length) {
      return chatAtlasGraphDivergenceEmpty('identical', 'chains-identical');
    }
    if (prefix >= currentChain.length || prefix >= defaultChain.length) {
      // One chain is a prefix of the other: a continuation, not a branch edge.
      return fail('divergence-is-continuation');
    }
    const owner = currentChain[prefix - 1] || null;
    const currentRoot = currentChain[prefix];
    const defaultRoot = defaultChain[prefix];
    if (!owner) return fail('shared-owner-unproven');
    if (currentRoot.nodeId === defaultRoot.nodeId) return fail('divergence-roots-identical');

    // ── Resolve the EXISTING branch-vector point on each chain ────────────
    const currentVector = chatAtlasBranchVectorForChain(currentChain, byId);
    const defaultVector = chatAtlasBranchVectorForChain(defaultChain, byId);
    const currentPoint = chatAtlasGraphDivergencePointFor(currentVector, currentRoot.nodeId);
    const defaultPoint = chatAtlasGraphDivergencePointFor(defaultVector, defaultRoot.nodeId);
    if (!currentPoint || !defaultPoint) return fail('branch-vector-point-absent');
    const agreement = String(currentPoint.kind) === String(defaultPoint.kind)
      && String(currentPoint.ownerMessageId || '') === String(defaultPoint.ownerMessageId || '')
      && Number(currentPoint.variantCount || 0) === Number(defaultPoint.variantCount || 0);
    if (!agreement) return fail('branch-vector-disagreement');
    const variantIds = Array.isArray(defaultPoint.variantIds) ? defaultPoint.variantIds : [];
    if (!variantIds.includes(currentRoot.nodeId) || !variantIds.includes(defaultRoot.nodeId)) {
      return fail('roots-not-in-one-variant-set');
    }
    const kind = String(defaultPoint.kind || '');
    if (kind !== 'question-edit' && kind !== 'assistant-regeneration') return fail('divergence-kind-unknown');
    const currentIndex = variantIds.indexOf(currentRoot.nodeId);
    const defaultIndex = variantIds.indexOf(defaultRoot.nodeId);
    if (currentIndex < 0 || defaultIndex < 0) return fail('variant-index-unresolved');

    // ── Mission D: strict direct answer-sibling proof ─────────────────────
    let directAnswerSiblingProof = false;
    if (kind === 'assistant-regeneration') {
      const roots = owner.productUser === true
        ? chatAtlasConvergenceAnswerVariantRoots(owner, byId)
        : [];
      const rootIds = roots.map((node) => node.nodeId);
      directAnswerSiblingProof = owner.productUser === true
        && roots.length > 1
        && rootIds.includes(currentRoot.nodeId)
        && rootIds.includes(defaultRoot.nodeId)
        && !!chatAtlasAnswerIdentityForRoot(currentRoot, byId)
        && !!chatAtlasAnswerIdentityForRoot(defaultRoot, byId);
    }
    // ── Mission E: strict question-variant proof ──────────────────────────
    let questionVariantProof = false;
    if (kind === 'question-edit') {
      const variants = currentRoot.productUser === true
        ? chatAtlasConvergenceQuestionVariants(currentRoot, byId)
        : [];
      const variantNodeIds = variants.map((node) => node.nodeId);
      questionVariantProof = currentRoot.productUser === true
        && defaultRoot.productUser === true
        && variants.length > 1
        && variantNodeIds.includes(currentRoot.nodeId)
        && variantNodeIds.includes(defaultRoot.nodeId)
        && currentRoot.parentId === owner.nodeId
        && defaultRoot.parentId === owner.nodeId;
    }
    if (kind === 'assistant-regeneration' && !directAnswerSiblingProof) {
      return fail('answer-sibling-proof-failed');
    }
    if (kind === 'question-edit' && !questionVariantProof) return fail('question-variant-proof-failed');
    if (String(selectedPathAcquisitionState.graph?.captureIdentity || '') !== captureAtStart) {
      return fail('graph-capture-changed');
    }
    return chatAtlasFreeze({
      state: 'proven',
      reason: null,
      kind,
      order: Number(defaultPoint.order || 0),
      sharedPrefixLength: prefix,
      ownerFound: true,
      ownerRole: chatAtlasTurn2AuditRole(owner),
      ownerMessageId: chatAtlasCompleteIndexIdentity(owner.messageId) || null,
      currentRootFound: true,
      defaultRootFound: true,
      currentRootMessageId: chatAtlasCompleteIndexIdentity(currentRoot.messageId) || null,
      defaultRootMessageId: chatAtlasCompleteIndexIdentity(defaultRoot.messageId) || null,
      variantCount: Number(defaultPoint.variantCount || variantIds.length || 0),
      currentIndex,
      defaultIndex,
      requiredDirection: defaultIndex > currentIndex ? 'next' : 'previous',
      directAnswerSiblingProof,
      questionVariantProof,
      branchVectorAgreement: true,
      observedKind: null,
      currentQuestionMessageId: kind === 'question-edit'
        ? (chatAtlasCompleteIndexIdentity(currentRoot.messageId) || null) : null,
      defaultQuestionMessageId: kind === 'question-edit'
        ? (chatAtlasCompleteIndexIdentity(defaultRoot.messageId) || null) : null,
    });
  }

  // One computation per graph capture. Never cached across captures.
  function chatAtlasGraphDivergence() {
    const key = [
      String(completeTurnIndexAuthorityState.chatId || ''),
      String(completeTurnIndexAuthorityState.routeKey || ''),
      Number(completeTurnIndexAuthorityState.generation || 0),
      String(selectedPathAcquisitionState.graph?.captureIdentity || ''),
    ].join('|');
    if (chatAtlasGraphDivergenceState.key === key && chatAtlasGraphDivergenceState.value) {
      return chatAtlasGraphDivergenceState.value;
    }
    let value = null;
    try { value = chatAtlasComputeGraphDivergence(); }
    catch { value = chatAtlasGraphDivergenceEmpty('fail-closed', 'graph-divergence-threw'); }
    chatAtlasGraphDivergenceState.key = key;
    chatAtlasGraphDivergenceState.value = value;
    return value;
  }

  // ── Proof-only question-edit plan (Stage 2C-2ah8) ────────────────────────
  // Uses the UNCHANGED prover. Nothing here clicks, focuses or dispatches:
  // activation is refused by contract at this stage.
  const chatAtlasQuestionEditPlanState = {
    state: 'idle', reason: null, plan: null, activations: 0,
  };

  function chatAtlasQuestionEditSectionFor(messageId) {
    const id = chatAtlasCompleteIndexIdentity(messageId);
    if (!id) return null;
    let el = null;
    try { el = D.querySelector(`[data-message-author-role="user"][data-message-id="${id}"]`); } catch { el = null; }
    if (!el) return null;
    try { return el.closest('[data-testid^="conversation-turn-"]') || null; } catch { return null; }
  }

  function chatAtlasBuildQuestionEditPlan(divergence) {
    const record = (state, reason, plan = null) => {
      chatAtlasQuestionEditPlanState.state = state;
      chatAtlasQuestionEditPlanState.reason = reason;
      chatAtlasQuestionEditPlanState.plan = plan ? chatAtlasFreeze(plan) : null;
      return chatAtlasFreeze({ state, reason, plan: chatAtlasQuestionEditPlanState.plan });
    };
    if (divergence?.state !== 'proven' || divergence.kind !== 'question-edit') {
      return record('fail-closed', 'question-edit-divergence-unproven');
    }
    const section = chatAtlasQuestionEditSectionFor(divergence.currentQuestionMessageId);
    if (!section) return record('fail-closed', 'question-edit-control-unavailable');
    const proof = chatAtlasProveConvergenceStep(Object.freeze({
      kind: 'question-edit',
      section,
      mountedQId: divergence.currentQuestionMessageId,
      expectedQId: divergence.defaultQuestionMessageId,
      mountedAId: null,
      expectedPrimaryAId: null,
    }));
    if (proof.ok !== true) return record('fail-closed', proof.reason || 'question-edit-step-unproven');
    const controls = chatAtlasNativeEditControls(section);
    return record('ready', null, {
      kind: 'question-edit',
      ownerMessageId: divergence.ownerMessageId,
      order: divergence.order,
      variantCount: divergence.variantCount,
      currentIndex: divergence.currentIndex,
      targetIndex: divergence.defaultIndex,
      requiredDirection: divergence.requiredDirection,
      pagerOwnerId: String(controls.ownerId || ''),
      pagerOwnerProven: !!controls.ownerId
        && controls.ownerId === chatAtlasCompleteIndexIdentity(divergence.currentQuestionMessageId),
      previousAvailable: !!controls.previous,
      nextAvailable: !!controls.next,
      // This stage proves the step. It never earns the right to take it.
      activationPermitted: false,
    });
  }

  function chatAtlasConvergeDefaultNativeAnswers(computed, reason) {
    const state = completeTurnIndexAuthorityState;
    if (state.manualOverrideActive === true) {
      return Object.freeze({ ok: false, activated: false, reason: 'manual-override-active' });
    }
    const transaction = chatAtlasBranchTransactionCurrent();
    // A default convergence owns no user transaction: bind it to the graph
    // capture instead, and never open or supersede a manual one.
    const record = {
      token: String(transaction?.token || `default:${selectedPathAcquisitionState.graph?.captureIdentity || ''}`),
      chatId: String(state.chatId || ''),
      routeKey: String(state.routeKey || ''),
      generation: Number(state.generation || 0),
      origin: 'default-latest-created',
    };
    // Record the exact divergence owner before evaluating native evidence, so
    // the reveal target is always the turn that actually diverges.
    const revealTarget = chatAtlasFirstDivergenceTarget(computed.turns);
    chatAtlasDefaultOverlayState.revealTargetOrder = revealTarget.order;
    chatAtlasDefaultOverlayState.revealTargetQId = revealTarget.qId;
    chatAtlasDefaultOverlayState.revealTargetExpectedAId = revealTarget.expectedAId;
    chatAtlasDefaultOverlayState.revealTargetCurrentAId = revealTarget.currentAId;
    chatAtlasDefaultOverlayState.revealTargetDivergenceKind = revealTarget.kind;
    chatAtlasDefaultOverlayState.revealTargetReason = revealTarget.reason;
    if (revealTarget.ok !== true) {
      chatAtlasDefaultOverlayState.convergenceReason = revealTarget.reason;
      return Object.freeze({ ok: false, activated: false, reason: revealTarget.reason });
    }
    const evaluation = chatAtlasEvaluateNativeAgainstTarget(computed.turns);
    // Expected identities are recorded for EVERY outcome, so an unavailable
    // target never reports null targets.
    chatAtlasDefaultOverlayState.convergenceExpectedQId = evaluation.expectedQId;
    chatAtlasDefaultOverlayState.convergenceExpectedAId = evaluation.expectedPrimaryAId;
    chatAtlasDefaultOverlayState.convergenceEvaluation = evaluation.result;
    if (evaluation.result === 'unavailable') {
      // One bounded, reversible reveal may mount the exact target so a LATER
      // stage has a real pager to prove. This never activates a control and
      // never starts convergence: attempts stay 0 here by construction.
      try { chatAtlasRevealRunOneShot(revealTarget); } catch {}
      chatAtlasDefaultOverlayState.convergenceReason = `native-target-unavailable:${evaluation.reason}`;
      return Object.freeze({
        ok: false, activated: false, reason: 'native-target-unavailable', detail: evaluation.reason,
      });
    }
    if (evaluation.result === 'match') {
      chatAtlasDefaultOverlayState.convergenceReason = 'native-already-matches';
      return Object.freeze({ ok: true, activated: false, reason: 'native-already-matches' });
    }
    const mismatch = evaluation.mismatch;
    if (!mismatch) {
      chatAtlasDefaultOverlayState.convergenceReason = 'native-evaluation-unresolved';
      return Object.freeze({ ok: false, activated: false, reason: 'native-evaluation-unresolved' });
    }
    // The target must be fully known BEFORE anything is attempted. An answer
    // regeneration with no target answer identity is not a provable step.
    chatAtlasDefaultOverlayState.convergenceExpectedQId = mismatch.expectedQId || null;
    chatAtlasDefaultOverlayState.convergenceExpectedAId = mismatch.expectedPrimaryAId || null;
    if (!chatAtlasCompleteIndexIdentity(mismatch.expectedQId)) {
      chatAtlasDefaultOverlayState.convergenceReason = 'target-question-unproven';
      return Object.freeze({ ok: false, activated: false, reason: 'target-question-unproven' });
    }
    if (
      mismatch.kind === 'assistant-regeneration'
      && !chatAtlasCompleteIndexIdentity(mismatch.expectedPrimaryAId)
    ) {
      chatAtlasDefaultOverlayState.convergenceReason = 'target-variant-unproven';
      return Object.freeze({ ok: false, activated: false, reason: 'target-variant-unproven' });
    }
    const proof = chatAtlasProveConvergenceStep(mismatch);
    if (proof.ok !== true) {
      chatAtlasDefaultOverlayState.convergenceReason = proof.reason;
      return Object.freeze({ ok: false, activated: false, reason: proof.reason });
    }
    if (!proof.button) {
      chatAtlasDefaultOverlayState.convergenceReason = 'native-control-unavailable';
      return Object.freeze({ ok: false, activated: false, reason: 'native-control-unavailable' });
    }
    const attempts = Number(chatAtlasDefaultOverlayState.convergenceAttempts || 0);
    if (attempts >= CHAT_ATLAS_CONVERGENCE_MAX_STEPS) {
      chatAtlasDefaultOverlayState.convergenceReason = 'default-convergence-attempts-exhausted';
      return Object.freeze({ ok: false, activated: false, reason: 'default-convergence-attempts-exhausted' });
    }
    const signature = `${mismatch.kind}|${mismatch.expectedOrder}|${mismatch.mountedQId}|${mismatch.mountedAId}`;
    if (String(chatAtlasDefaultOverlayState.convergenceSignature || '') === signature) {
      chatAtlasDefaultOverlayState.convergenceReason = 'default-activation-produced-no-identity-change';
      return Object.freeze({ ok: false, activated: false, reason: 'default-activation-produced-no-identity-change' });
    }
    chatAtlasDefaultOverlayState.convergenceSignature = signature;
    chatAtlasDefaultOverlayState.convergenceAttempts = attempts + 1;
    chatAtlasDefaultOverlayState.convergenceExpectedAId = mismatch.expectedPrimaryAId;
    chatAtlasDefaultOverlayState.convergenceRecord = chatAtlasFreeze(record);
    // Our own activation is not a user selection.
    state.nativeConvergenceActivating = true;
    let clicked = 0;
    try {
      for (let step = 0; step < proof.steps; step += 1) {
        try { proof.button.click(); clicked += 1; } catch { break; }
      }
    } finally {
      state.nativeConvergenceActivating = false;
    }
    if (!clicked) {
      // The control did not run. Nothing was activated, so nothing may claim
      // it was: roll the attempt back and fail closed.
      chatAtlasDefaultOverlayState.convergenceAttempts = attempts;
      chatAtlasDefaultOverlayState.convergenceSignature = '';
      chatAtlasDefaultOverlayState.convergenceReason = 'native-control-activation-failed';
      return Object.freeze({ ok: false, activated: false, reason: 'native-control-activation-failed' });
    }
    chatAtlasBranchTransactionTrace('default-convergence-activated', {
      reason: `${proof.kind}@${mismatch.expectedOrder}:${proof.direction}:${clicked}`,
    });
    chatAtlasDefaultOverlayState.convergenceReason = 'activated-awaiting-identity';
    return Object.freeze({
      ok: true,
      activated: true,
      reason: 'default-convergence-activated',
      clicked,
      kind: proof.kind,
      expectedQId: mismatch.expectedQId,
      expectedPrimaryAId: mismatch.expectedPrimaryAId,
    });
  }

  function chatAtlasPublishDefaultLatestCreatedPath(reason = 'default-initial') {
    const state = completeTurnIndexAuthorityState;
    const record = (code, why) => {
      chatAtlasDefaultOverlayState.state = code;
      chatAtlasDefaultOverlayState.reason = why;
      // 'already-current' is a successful resolution with nothing to install.
      const alreadyCurrent = code === 'already-current';
      return Object.freeze({ ok: alreadyCurrent, reason: why, alreadyCurrent });
    };
    if (state.enabled !== true) return record('idle', 'authority-disabled');
    // A manual selection in this page session always wins.
    if (state.manualOverrideActive === true) return record('superseded', 'manual-override-active');
    const retained = selectedPathAcquisitionState.graph;
    if (
      !retained
      || retained.chatId !== String(state.chatId || '')
      || retained.routeKey !== String(state.routeKey || '')
      || Number(retained.generation || 0) !== Number(state.generation || 0)
    ) return record('waiting', 'graph-not-current');
    const captureIdentity = String(retained.captureIdentity || '');
    if (!captureIdentity) return record('waiting', 'graph-capture-unknown');
    const canonical = chatAtlasCanonicalPresentationIndex();
    if (!Array.isArray(canonical?.turns) || !canonical.turns.length) {
      return record('waiting', 'canonical-unavailable');
    }
    // Exactly one publication per (chat, route, generation, capture) — a DOM
    // mutation or a badge refresh can never turn into repeated work.
    const key = JSON.stringify([
      state.chatId, state.routeKey, Number(state.generation || 0),
      captureIdentity, String(canonical.sourceFingerprint || ''),
    ]);
    // Only a CONCLUSIVE outcome may suppress later attempts. Caching a
    // failure here was the live defect: the very first notification runs
    // before the effective index is installed, so an inconclusive comparison
    // became a permanent fail-closed for the whole page session.
    if (chatAtlasDefaultOverlayState.key === key
      && ['published', 'already-current'].includes(chatAtlasDefaultOverlayState.state)) {
      return Object.freeze({
        ok: true,
        reason: 'deduplicated',
        alreadyCurrent: chatAtlasDefaultOverlayState.state === 'already-current',
      });
    }
    const computed = chatAtlasComputeDefaultLatestCreatedPath();
    if (computed.ok !== true) {
      // Ambiguity is never guessed past: the host canonical path stays.
      chatAtlasDefaultOverlayState.terminalNodeId = null;
      chatAtlasDefaultOverlayState.terminalCreateTime = null;
      chatAtlasDefaultOverlayState.pathCount = 0;
      chatAtlasDefaultOverlayState.fingerprint = '';
      chatAtlasDefaultOverlayState.branchVectorCount = 0;
      return record('fail-closed', computed.reason);
    }
    // The default route may already BE the active path. That is a successful
    // resolution, not a failure: no overlay is required, and installing a
    // duplicate index would create a second authority for the same turns.
    let effective = null;
    try { effective = getEffectivePresentationIndex(); } catch { effective = null; }
    const effectiveTurns = Array.isArray(effective?.turns) ? effective.turns : [];
    chatAtlasDefaultOverlayState.effectiveAvailableAtCheck = effectiveTurns.length > 0;
    chatAtlasDefaultOverlayState.effectiveCountAtCheck = effectiveTurns.length;
    if (!effectiveTurns.length) {
      // Nothing to compare against yet. Defer WITHOUT caching: the existing
      // authority notification fires again once the index settles.
      chatAtlasDefaultOverlayState.samePathCheckRan = false;
      chatAtlasDefaultOverlayState.samePathResult = null;
      chatAtlasDefaultOverlayState.firstDifference = null;
      chatAtlasDefaultOverlayState.deferrals += 1;
      return record('waiting', 'effective-index-unavailable');
    }
    chatAtlasDefaultOverlayState.samePathCheckRan = true;
    const difference = chatAtlasFirstPathIdentityDifference(computed.turns, effectiveTurns);
    chatAtlasDefaultOverlayState.firstDifference = difference;
    chatAtlasDefaultOverlayState.samePathResult = difference === null;
    if (chatAtlasSamePathIdentity(computed.turns, effectiveTurns)) {
      chatAtlasDefaultOverlayState.terminalNodeId = computed.terminalNodeId;
      chatAtlasDefaultOverlayState.terminalCreateTime = computed.terminalCreateTime;
      chatAtlasDefaultOverlayState.pathCount = computed.count;
      chatAtlasDefaultOverlayState.fingerprint = computed.fingerprint;
      chatAtlasDefaultOverlayState.branchVectorCount = computed.branchVector.length;
      chatAtlasDefaultOverlayState.effectiveIdentity = chatAtlasPathIdentityKey(effectiveTurns);
      chatAtlasDefaultOverlayState.resolutions += 1;
      chatAtlasDefaultOverlayState.key = key;
      chatAtlasBranchTransactionTrace('default-already-current', { reason: `${computed.count}` });
      return record('already-current', 'canonical-already-selected');
    }
    // Classify the divergence against the canonical path. The anchor model is
    // NOT the same for both kinds, which is exactly why anchoring on the last
    // shared row rejected a legitimate answer-variant divergence.
    // First position where the two routes stop agreeing. Paths of different
    // length diverge at the end of the shorter one.
    const shared = Math.min(computed.turns.length, canonical.turns.length);
    let at = -1;
    for (let i = 0; i < shared; i += 1) {
      if (
        chatAtlasCompleteIndexIdentity(computed.turns[i]?.qId)
          !== chatAtlasCompleteIndexIdentity(canonical.turns[i]?.qId)
        || chatAtlasCompleteIndexIdentity(computed.turns[i]?.primaryAId)
          !== chatAtlasCompleteIndexIdentity(canonical.turns[i]?.primaryAId)
      ) { at = i; break; }
    }
    if (at < 0) {
      if (computed.turns.length === canonical.turns.length) {
        return record('fail-closed', 'default-canonical-identical');
      }
      at = shared;
    }
    if (at < 1) return record('fail-closed', 'default-canonical-root-mismatch');
    // Same question, different answer => the divergence is the answer variant
    // AT that turn. Anything else is a question/continuation divergence owned
    // by the last shared turn above it.
    const sameQuestionAtDifference = at < shared
      && chatAtlasCompleteIndexIdentity(computed.turns[at]?.qId)
        === chatAtlasCompleteIndexIdentity(canonical.turns[at]?.qId);
    // Answer divergence: anchor ON the differing turn. Question divergence:
    // anchor on the last shared turn, above it.
    // OBSERVATION ONLY. It still selects the presentation anchor model, which
    // is a row concern, but it may never decide the native control kind.
    const observedDivergenceKind = sameQuestionAtDifference ? 'assistant-regeneration' : 'question-edit';
    chatAtlasDefaultOverlayState.observedDivergenceKind = observedDivergenceKind;
    const graphDivergence = chatAtlasGraphDivergence();
    // Required invariant: assistant-regeneration ⇒ direct answer-root sibling
    // relationship is graph-proven ⇒ both alternatives share one variant set.
    const divergenceKind = graphDivergence.state === 'proven'
      && graphDivergence.kind === 'assistant-regeneration'
      && graphDivergence.directAnswerSiblingProof === true
      ? 'assistant-regeneration'
      : 'question-edit';
    const anchorIndex = sameQuestionAtDifference ? at : at - 1;
    const prefix = anchorIndex + 1;
    if (anchorIndex < 0 || prefix > computed.turns.length || prefix > canonical.turns.length) {
      return record('fail-closed', 'default-divergence-unresolved');
    }
    // Only an assistant-regeneration divergence may qualify for the scoped
    // canonical-question reuse exception.
    // The misclassified case, and ONLY it: the presentation rows share a qId,
    // so the old classifier called this an answer regeneration and sent it to
    // the answer converger — while the graph proves the branch edge is a
    // question edit. A divergence the observation ALREADY read as a question
    // edit is ordinary publication and is left entirely alone.
    if (
      observedDivergenceKind === 'assistant-regeneration'
      && graphDivergence.state === 'proven'
      && graphDivergence.kind === 'question-edit'
    ) {
      chatAtlasDefaultOverlayState.answerConvergenceSuppressed = true;
      chatAtlasDefaultOverlayState.nativeRoute = 'graph-proven-question-edit';
      const plan = chatAtlasBuildQuestionEditPlan(graphDivergence);
      chatAtlasDefaultOverlayState.terminalNodeId = computed.terminalNodeId;
      chatAtlasDefaultOverlayState.terminalCreateTime = computed.terminalCreateTime;
      chatAtlasDefaultOverlayState.pathCount = computed.count;
      chatAtlasDefaultOverlayState.branchVectorCount = computed.branchVector.length;
      return plan.state === 'ready'
        ? record('waiting', 'graph-proven-question-edit-plan-ready')
        : record('fail-closed', plan.reason || 'question-edit-plan-unresolved');
    }
    chatAtlasDefaultOverlayState.answerConvergenceSuppressed = false;
    chatAtlasDefaultOverlayState.nativeRoute = divergenceKind === 'assistant-regeneration'
      ? 'graph-proven-assistant-regeneration'
      : 'graph-divergence-unproven';
    const answerOnly = divergenceKind === 'assistant-regeneration'
      ? chatAtlasDefaultAnswerOnlyDivergence(computed.turns, canonical.turns)
      : Object.freeze({ ok: false, reason: 'answer-only-kind-ineligible' });
    chatAtlasDefaultOverlayState.resolutionSource = answerOnly.ok === true
      ? 'scoped-default-answer-overlay'
      : null;
    chatAtlasDefaultOverlayState.answerOnlyReason = answerOnly.reason;
    if (answerOnly.ok === true) {
      // Native content disagrees only by answer selection. Publishing here
      // would be refused by the Core parity gate — and rightly so, because the
      // old answer is still what the page renders. Converge the native pager
      // instead and let the host authority refresh settle the route.
      const converged = chatAtlasConvergeDefaultNativeAnswers(computed, reason);
      chatAtlasDefaultOverlayState.resolutionSource = 'native-convergence';
      chatAtlasDefaultOverlayState.terminalNodeId = computed.terminalNodeId;
      chatAtlasDefaultOverlayState.terminalCreateTime = computed.terminalCreateTime;
      chatAtlasDefaultOverlayState.pathCount = computed.count;
      chatAtlasDefaultOverlayState.branchVectorCount = computed.branchVector.length;
      // Only a REAL activation may be reported as one. `ok` alone is not
      // activation: the converger also returns ok for 'native-already-matches',
      // which is a non-activation and was being mislabelled here.
      if (converged.activated === true) {
        return record('converging', 'native-convergence-activated');
      }
      if (converged.ok === true && converged.reason === 'native-already-matches') {
        // Native already renders the default answers; the host authority has
        // not republished yet. Wait for it rather than claim either state.
        return record('waiting', 'native-matches-awaiting-authority-refresh');
      }
      return record('fail-closed', converged.reason || 'default-convergence-unresolved');
    }
    const anchor = computed.turns[anchorIndex];
    if (divergenceKind === 'assistant-regeneration') {
      const ownership = chatAtlasProveAnchorBranchOwnership(computed, anchorIndex);
      chatAtlasDefaultOverlayState.anchorOwnershipReason = ownership.reason || null;
      if (ownership.ok !== true) {
        return record('fail-closed', ownership.reason || 'default-anchor-branch-unproven');
      }
    }
    const anchorSelectedAId = chatAtlasCompleteIndexIdentity(anchor?.primaryAId);
    if (!anchorSelectedAId) return record('fail-closed', 'default-anchor-answer-missing');
    const token = `default:${captureIdentity}:${computed.fingerprint}`;
    if (!chatAtlasCompleteIndexIdentity(computed.rootNodeId)) {
      return record('fail-closed', 'default-root-node-unresolved');
    }
    // Same immutable shape a proven manual acquisition installs: the turns the
    // default path shares with the host canonical index ARE the canonical rows,
    // tagged as the canonical prefix; only the divergent tail is graph-derived.
    const defaultPath = chatAtlasFreeze(computed.turns.map((turn, index) => (
      index < prefix
        ? chatAtlasFreeze({
          order: Number(canonical.turns[index].order || 0),
          qId: canonical.turns[index].qId,
          turnId: canonical.turns[index].turnId,
          // The anchor row keeps the DEFAULT route's selected answer; the
          // rows above it are the host canonical rows unchanged.
          primaryAId: index === anchorIndex
            ? turn.primaryAId
            : canonical.turns[index].primaryAId,
          answerVariants: chatAtlasFreeze(Array.from(
            (index === anchorIndex ? turn.answerVariants : canonical.turns[index].answerVariants) || [],
          )),
          noAnswer: index === anchorIndex
            ? turn.noAnswer === true
            : canonical.turns[index].noAnswer === true,
          stopped: index === anchorIndex
            ? turn.stopped === true
            : canonical.turns[index].stopped === true,
          // Evidence for the default origin is the host canonical row itself.
          provenance: index === anchorIndex ? 'anchor' : 'canonical-prefix',
          confirmedByNativeEvidence: index === anchorIndex
            ? true
            : canonical.turns[index].confirmedByNativeEvidence === true,
        })
        : turn
    )));
    const proof = chatAtlasFreeze({
      anchorQId: chatAtlasCompleteIndexIdentity(anchor.qId),
      anchorSelectedAId,
      rootNodeId: computed.rootNodeId,
      tailNodeId: computed.terminalNodeId,
      pathLength: defaultPath.length,
      canonicalPrefixLength: prefix,
      canonicalFingerprint: String(canonical.sourceFingerprint || ''),
      graphCapturedAt: String(retained.identityGraph?.capturedAt || ''),
      token,
      chatId: String(state.chatId || ''),
      routeKey: String(state.routeKey || ''),
      generation: Number(state.generation || 0),
      staleRevision: 0,
      // Same reason/source discipline as a proven manual acquisition: this IS
      // a proven complete path derived from the host identity graph.
      reason: 'selected-path-proven',
      source: 'host-identity-graph',
      defaultOrigin: true,
      defaultTerminalNodeId: computed.terminalNodeId,
      defaultTerminalCreateTime: computed.terminalCreateTime,
      defaultPathFingerprint: computed.fingerprint,
      graphCaptureIdentity: captureIdentity,
      manualOverrideRevision: Number(state.manualOverrideRevision || 0),
      defaultDivergenceKind: divergenceKind,
      defaultAnswerOnlyProven: answerOnly.ok === true,
      defaultResolutionSource: answerOnly.ok === true
        ? 'scoped-default-answer-overlay'
        : 'default-latest-created-overlay',
    });
    selectedPathAcquisitionState.origin = 'default-latest-created';
    selectedPathAcquisitionState.token = token;
    selectedPathAcquisitionState.anchorQId = proof.anchorQId;
    selectedPathAcquisitionState.anchorSelectedAId = anchorSelectedAId;
    selectedPathAcquisitionState.chatId = proof.chatId;
    selectedPathAcquisitionState.routeKey = proof.routeKey;
    selectedPathAcquisitionState.generation = proof.generation;
    selectedPathAcquisitionState.staleRevision = 0;
    selectedPathAcquisitionState.status = 'proven';
    selectedPathAcquisitionState.reason = 'default-latest-created-proven';
    selectedPathAcquisitionState.path = defaultPath;
    selectedPathAcquisitionState.proof = proof;
    selectedPathAcquisitionState.provenAt = new Date().toISOString();
    chatAtlasBranchTransactionTrace('default-publish', {
      reason: `${computed.count}@${String(computed.terminalNodeId || '').slice(0, 8)}`,
    });
    let status = null;
    try {
      status = typeof chatAtlasSelectedPathOverlayEvaluate === 'function'
        ? chatAtlasSelectedPathOverlayEvaluate()
        : null;
    } catch { status = null; }
    const active = selectedPathOverlayState.status === 'active';
    chatAtlasDefaultOverlayState.terminalNodeId = computed.terminalNodeId;
    chatAtlasDefaultOverlayState.terminalCreateTime = computed.terminalCreateTime;
    chatAtlasDefaultOverlayState.pathCount = computed.count;
    chatAtlasDefaultOverlayState.fingerprint = computed.fingerprint;
    chatAtlasDefaultOverlayState.branchVectorCount = computed.branchVector.length;
    if (!active) return record('fail-closed', String(status?.reason || 'overlay-refused'));
    chatAtlasDefaultOverlayState.key = key;
    chatAtlasDefaultOverlayState.publications += 1;
    chatAtlasDefaultOverlayState.state = 'published';
    chatAtlasDefaultOverlayState.reason = reason;
    return Object.freeze({ ok: true, reason, count: computed.count });
  }

  // Branch metadata for the turns on the effective path: the active position
  // and total at each turn, for the MiniMap boxes. Alternatives never become
  // extra turns — this is metadata ON a turn, not a turn.
  function chatAtlasEffectivePathBranchBadges() {
    const out = new Map();
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return out;
    const index = getEffectivePresentationIndex();
    const turns = Array.isArray(index?.turns) ? index.turns : [];
    for (const turn of turns) {
      const qId = chatAtlasCompleteIndexIdentity(turn?.qId);
      const questionNode = chatAtlasConvergenceUniqueNode(scope.graph, qId, 'productUser');
      if (!questionNode) continue;
      const badge = {
        questionIndex: 0, questionCount: 0, answerIndex: 0, answerCount: 0,
        qId, primaryAId: chatAtlasCompleteIndexIdentity(turn?.primaryAId) || '',
      };
      const questionVariants = chatAtlasConvergenceQuestionVariants(questionNode, scope.byId);
      if (questionVariants.length > 1) {
        const at = questionVariants.findIndex((entry) => entry.nodeId === questionNode.nodeId);
        if (at >= 0) { badge.questionIndex = at + 1; badge.questionCount = questionVariants.length; }
      }
      const answerRoots = chatAtlasConvergenceAnswerVariantRoots(questionNode, scope.byId);
      if (answerRoots.length > 1 && badge.primaryAId) {
        const answerNode = chatAtlasConvergenceUniqueNode(scope.graph, badge.primaryAId, 'productAnswer');
        const root = chatAtlasConvergenceBranchRoot(questionNode, answerNode, scope.byId)
          || answerRoots.find((entry) => chatAtlasAnswerIdentityForRoot(entry, scope.byId) === badge.primaryAId)
          || null;
        const at = root ? answerRoots.findIndex((entry) => entry.nodeId === root.nodeId) : -1;
        if (at >= 0) { badge.answerIndex = at + 1; badge.answerCount = answerRoots.length; }
      }
      if (badge.questionCount > 1 || badge.answerCount > 1) out.set(qId, chatAtlasFreeze(badge));
    }
    return out;
  }

  // The mounted native path, read once, compared against the effective branch.
  function chatAtlasMapMountedNativePath() {
    const index = getEffectivePresentationIndex();
    const turns = Array.isArray(index?.turns) ? index.turns : [];
    let sections = [];
    try {
      sections = Array.from(D.querySelectorAll('[data-testid^="conversation-turn-"]'));
    } catch { sections = []; }
    // A turn's question and answer may share one container or occupy two
    // consecutive ones. Carry the open row forward so the answer is read — and
    // its pager located — under either host topology.
    const rows = [];
    let open = null;
    for (const section of sections) {
      let qEl = null;
      let aEl = null;
      try { qEl = section.querySelector?.('[data-message-author-role="user"][data-message-id]') || null; } catch {}
      try { aEl = section.querySelector?.('[data-message-author-role="assistant"][data-message-id]') || null; } catch {}
      const mountedQId = chatAtlasCompleteIndexIdentity(qEl?.getAttribute?.('data-message-id'));
      const mountedAId = chatAtlasCompleteIndexIdentity(aEl?.getAttribute?.('data-message-id')) || '';
      const pagers = chatAtlasNativeVariantPagers(section);
      if (mountedQId) {
        const turn = turns.find((entry) => chatAtlasCompleteIndexIdentity(entry?.qId) === mountedQId) || null;
        open = {
          section,
          answerSection: section,
          mountedQId,
          mountedAId: '',
          order: Number(turn?.order || 0),
          expectedQId: chatAtlasCompleteIndexIdentity(turn?.qId) || '',
          expectedPrimaryAId: chatAtlasCompleteIndexIdentity(turn?.primaryAId) || '',
          questionIndicator: String(pagers.find((p) => p.kind === 'question-edit')?.indicator || ''),
          answerIndicator: '',
          onBranch: !!turn,
          answerSeen: false,
        };
        rows.push(open);
      }
      if (mountedAId && open && !open.answerSeen) {
        open.answerSeen = true;
        open.answerSection = section;
        open.mountedAId = mountedAId;
        open.answerIndicator = String(pagers.find((p) => p.kind === 'assistant-regeneration')?.indicator || '');
      }
    }
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      row.reason = !row.onBranch
        ? 'question-off-branch'
        : ((row.mountedAId && row.expectedPrimaryAId && row.mountedAId !== row.expectedPrimaryAId)
          ? 'answer-variant-off-branch'
          : 'agrees');
      rows[i] = Object.freeze(row);
    }
    const terminalQId = chatAtlasCompleteIndexIdentity(turns[turns.length - 1]?.qId) || '';
    let prefix = 0;
    for (const row of rows) {
      if (row.reason !== 'agrees' || row.order !== prefix + 1) break;
      prefix = row.order;
    }
    return Object.freeze({
      rows: Object.freeze(rows),
      mountedCount: rows.length,
      prefixLength: prefix,
      pathLength: turns.length,
      terminalMounted: !!terminalQId && rows.some((row) => row.mountedQId === terminalQId),
    });
  }

  // Authority contract, made observable: the graph holds EVERY branch node, the
  // effective path holds exactly one selected root-to-leaf route, and Ledger and
  // MiniMap hold exactly that route — never the alternatives. The nested branch
  // choices live in the separate selection plan, not in any linear surface.
  function chatAtlasNativeBranchPlanDiagnostics() {
    const out = {
      graphNodeCount: 0,
      effectivePathTurnCount: 0,
      ledgerTurnCount: 0,
      miniMapTurnCount: 0,
      nativeMountedTurnCount: 0,
      nativeMountedPrefixCount: 0,
      nativeTerminalMounted: false,
      nativeFirstMismatchKind: null,
      nativeFirstMismatchOrder: 0,
      nativeFirstMismatchMountedAId: null,
      nativeFirstMismatchExpectedAId: null,
      nativeBranchPlanReason: null,
      nativeBranchPlanPointCount: 0,
      nativeBranchPlanEditPointCount: 0,
      nativeBranchPlanRegenerationPointCount: 0,
      nativeBranchPlanRemainingMismatches: 0,
    };
    try {
      const graph = selectedPathAcquisitionState.graph?.identityGraph || null;
      out.graphNodeCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
      const index = getEffectivePresentationIndex();
      out.effectivePathTurnCount = Array.isArray(index?.turns) ? index.turns.length : 0;
      out.ledgerTurnCount = Array.isArray(chatAtlasLedgerState?.members)
        ? chatAtlasLedgerState.members.length
        : 0;
      let miniMapRoot = null;
      try { miniMapRoot = D.querySelector(CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL); } catch {}
      if (miniMapRoot) {
        try {
          out.miniMapTurnCount = Array.from(
            miniMapRoot.querySelectorAll(CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL) || [],
          ).length;
        } catch {}
      }
      const map = chatAtlasMapMountedNativePath();
      out.nativeMountedTurnCount = map.mountedCount;
      out.nativeMountedPrefixCount = map.prefixLength;
      out.nativeTerminalMounted = map.terminalMounted === true;
      out.nativeBranchPlanRemainingMismatches = map.rows.filter((row) => row.reason !== 'agrees').length;
      const mismatch = chatAtlasFirstNativePathMismatch();
      if (mismatch) {
        out.nativeFirstMismatchKind = mismatch.kind;
        out.nativeFirstMismatchOrder = Number(mismatch.expectedOrder || 0);
        out.nativeFirstMismatchMountedAId = mismatch.mountedAId || null;
        out.nativeFirstMismatchExpectedAId = mismatch.expectedPrimaryAId || null;
      }
      const plan = chatAtlasBuildNativeBranchSelectionPlan();
      out.nativeBranchPlanReason = plan.ok === true ? null : String(plan.reason || 'unknown');
      out.nativeBranchPlanPointCount = plan.points.length;
      out.nativeBranchPlanEditPointCount = plan.points.filter((p) => p.kind === 'question-edit').length;
      out.nativeBranchPlanRegenerationPointCount = plan.points
        .filter((p) => p.kind === 'assistant-regeneration').length;
    } catch {}
    return out;
  }

  // The first mounted native turn whose identity disagrees with the published
  // effective branch — either the QUESTION variant (a user edit) or, when the
  // question already agrees, the ANSWER variant beneath it (a regeneration).
  // Returns null only when every mounted turn agrees on BOTH.
  function chatAtlasFirstNativePathMismatch(targetTurns = null) {
    // Default target is the published effective branch. The default-origin
    // convergence passes the newest-created path instead, so the SAME proven
    // machinery aligns native content with it.
    const index = targetTurns ? null : getEffectivePresentationIndex();
    const turns = Array.isArray(targetTurns)
      ? targetTurns
      : (Array.isArray(index?.turns) ? index.turns : []);
    if (!turns.length) return null;
    let sections = [];
    try {
      sections = Array.from(D.querySelectorAll('[data-testid^="conversation-turn-"]'));
    } catch { return null; }
    let lastOnBranchOrder = 0;
    // The turn whose answer has not been read yet. It stays open across one
    // container boundary so a host that splits question and answer into
    // separate turn containers is read exactly like one that groups them.
    let open = null;
    for (const section of sections) {
      let qEl = null;
      let aEl = null;
      try { qEl = section.querySelector?.('[data-message-author-role="user"][data-message-id]') || null; } catch {}
      try { aEl = section.querySelector?.('[data-message-author-role="assistant"][data-message-id]') || null; } catch {}
      const mountedQId = chatAtlasCompleteIndexIdentity(qEl?.getAttribute?.('data-message-id'));
      const mountedAId = chatAtlasCompleteIndexIdentity(aEl?.getAttribute?.('data-message-id')) || '';
      if (mountedQId) {
        const onBranch = turns.find((turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === mountedQId);
        if (!onBranch) {
          // Disagreement: the branch turn this position should carry is the
          // one after the nearest preceding mounted question that IS on it.
          if (!lastOnBranchOrder) return null;
          const expected = turns.find((turn) => Number(turn?.order || 0) === lastOnBranchOrder + 1);
          if (!expected) return null;
          return Object.freeze({
            section,
            kind: 'question-edit',
            mountedQId,
            mountedAId,
            expectedQId: chatAtlasCompleteIndexIdentity(expected.qId),
            expectedPrimaryAId: chatAtlasCompleteIndexIdentity(expected.primaryAId),
            expectedOrder: Number(expected.order || 0),
          });
        }
        lastOnBranchOrder = Number(onBranch.order || 0);
        open = {
          mountedQId,
          expectedPrimaryAId: chatAtlasCompleteIndexIdentity(onBranch.primaryAId),
          order: lastOnBranchOrder,
        };
      }
      if (!mountedAId || !open) continue;
      const pending = open;
      open = null;
      // The question agrees, but the ANSWER variant mounted beneath it may
      // not. That branch point keeps every descendant unmounted while the turn
      // itself looks entirely correct — the exact live Turn-26 shape.
      if (pending.expectedPrimaryAId && mountedAId !== pending.expectedPrimaryAId) {
        return Object.freeze({
          section,
          kind: 'assistant-regeneration',
          mountedQId: pending.mountedQId,
          mountedAId,
          expectedQId: pending.mountedQId,
          expectedPrimaryAId: pending.expectedPrimaryAId,
          expectedOrder: pending.order,
        });
      }
    }
    return null;
  }

  // An indicator is only an indicator when an element's ENTIRE text is "n/m".
  // Scanning a container for the first digit-pair would read a neighbouring
  // pager's numbers — the exact way a turn carrying both an edit pager and a
  // regeneration pager loses control ownership.
  function chatAtlasConvergenceExactIndicator(el) {
    if (!el) return '';
    let nodes = [];
    try { nodes = Array.from(el.querySelectorAll?.('*') || []); } catch { nodes = []; }
    for (const node of nodes.concat([el])) {
      const match = String(node?.textContent || '').trim().match(/^(\d+)\s*\/\s*(\d+)$/);
      if (match) return `${match[1]}/${match[2]}`;
    }
    return '';
  }

  // Every variant pager inside one mounted turn container, each bound to the
  // message it belongs to. A turn may carry BOTH a user-edit pager and an
  // assistant-regeneration pager; ownership is structural (containment first,
  // else the nearest message preceding the pager in document order) and the
  // indicator is read from the pager's own group — never from the container,
  // never from screen position, never from visible prose.
  function chatAtlasNativeVariantPagers(section) {
    const out = [];
    if (!section) return out;
    let ordered = [];
    try {
      ordered = Array.from(section.querySelectorAll?.('[data-message-id], button') || []);
    } catch { return out; }
    const groups = new Map();
    let lastMessage = null;
    for (const node of ordered) {
      if (chatAtlasCompleteIndexIdentity(node?.getAttribute?.('data-message-id'))) {
        lastMessage = node;
        continue;
      }
      const label = String(node?.getAttribute?.('aria-label') || '').trim().toLowerCase();
      if (label !== 'previous response' && label !== 'next response') continue;
      let owner = null;
      try { owner = node.closest?.('[data-message-id]') || null; } catch {}
      if (!owner) owner = lastMessage;
      let group = node;
      let indicator = '';
      for (let hop = 0; hop < 8 && group; hop += 1) {
        indicator = chatAtlasConvergenceExactIndicator(group);
        if (indicator) break;
        group = group.parentElement || null;
      }
      const key = group || node;
      let entry = groups.get(key);
      if (!entry) {
        const ownerRole = String(owner?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase();
        entry = {
          kind: ownerRole === 'assistant'
            ? 'assistant-regeneration'
            : (ownerRole === 'user' ? 'question-edit' : ''),
          ownerId: chatAtlasCompleteIndexIdentity(owner?.getAttribute?.('data-message-id')) || '',
          ownerRole,
          previous: null,
          next: null,
          indicator,
        };
        groups.set(key, entry);
        out.push(entry);
      }
      if (label === 'previous response' && !entry.previous) entry.previous = node;
      if (label === 'next response' && !entry.next) entry.next = node;
      if (!entry.indicator) entry.indicator = indicator;
    }
    return out;
  }

  function chatAtlasConvergencePagerOfKind(section, kind) {
    const pager = chatAtlasNativeVariantPagers(section).find((entry) => entry.kind === kind);
    return pager
      ? { previous: pager.previous, next: pager.next, indicator: pager.indicator, ownerId: pager.ownerId }
      : { previous: null, next: null, indicator: '', ownerId: '' };
  }

  // Adapter: the user-question edit pager owned by this turn.
  function chatAtlasNativeEditControls(section) {
    return chatAtlasConvergencePagerOfKind(section, 'question-edit');
  }

  // Adapter: the assistant answer/regeneration pager owned by this turn. Same
  // aria labels, different owning message — so it needs its own identity proof.
  function chatAtlasNativeRegenerationControls(section) {
    return chatAtlasConvergencePagerOfKind(section, 'assistant-regeneration');
  }

  // Prove which sibling the control must move to, from the SAME retained
  // identity graph the branch was derived from. Fails closed unless the
  // mounted identity, the sibling set and the control's own position all
  // agree — direction is a RESULT of that proof, never an input.
  function chatAtlasProveConvergenceStep(mismatch) {
    const fail = (reason) => Object.freeze({ ok: false, reason });
    if (!mismatch?.mountedQId || !mismatch?.expectedQId) return fail('mismatch-identity-missing');
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return fail(scope.reason);
    const { graph, byId } = scope;
    const kind = String(mismatch.kind || 'question-edit');
    let siblings = [];
    let currentIndex = -1;
    let targetIndex = -1;
    let controls = null;
    let ownerId = '';
    if (kind === 'assistant-regeneration') {
      // The question already agrees; the answer variant beneath it does not.
      // The pager moves between the question's answer-branch ROOTS, so both
      // the mounted and the expected answer must resolve to one of them.
      const questionNode = chatAtlasConvergenceUniqueNode(graph, mismatch.expectedQId, 'productUser');
      if (!questionNode) return fail('mounted-question-ambiguous');
      const mountedAnswer = chatAtlasConvergenceUniqueNode(graph, mismatch.mountedAId, 'productAnswer');
      if (!mountedAnswer) return fail('mounted-answer-ambiguous');
      const expectedAnswer = chatAtlasConvergenceUniqueNode(graph, mismatch.expectedPrimaryAId, 'productAnswer');
      if (!expectedAnswer) return fail('expected-answer-ambiguous');
      const currentRoot = chatAtlasConvergenceBranchRoot(questionNode, mountedAnswer, byId);
      const targetRoot = chatAtlasConvergenceBranchRoot(questionNode, expectedAnswer, byId);
      if (!currentRoot || !targetRoot) return fail('variants-not-siblings');
      siblings = chatAtlasConvergenceAnswerVariantRoots(questionNode, byId);
      currentIndex = siblings.findIndex((node) => node.nodeId === currentRoot.nodeId);
      targetIndex = siblings.findIndex((node) => node.nodeId === targetRoot.nodeId);
      controls = chatAtlasNativeRegenerationControls(mismatch.section);
      ownerId = mismatch.mountedAId;
    } else {
      const mountedNode = chatAtlasConvergenceUniqueNode(graph, mismatch.mountedQId, 'productUser');
      if (!mountedNode) return fail('mounted-question-ambiguous');
      const expectedNode = chatAtlasConvergenceUniqueNode(graph, mismatch.expectedQId, 'productUser');
      if (!expectedNode) return fail('expected-question-ambiguous');
      if (!mountedNode.parentId || mountedNode.parentId !== expectedNode.parentId) {
        return fail('variants-not-siblings');
      }
      if (!byId.get(mountedNode.parentId)) return fail('variant-parent-unavailable');
      siblings = chatAtlasConvergenceQuestionVariants(mountedNode, byId);
      currentIndex = siblings.findIndex((node) => node.nodeId === mountedNode.nodeId);
      targetIndex = siblings.findIndex((node) => node.nodeId === expectedNode.nodeId);
      controls = chatAtlasNativeEditControls(mismatch.section);
      ownerId = mismatch.mountedQId;
    }
    if (currentIndex < 0 || targetIndex < 0) return fail('variant-index-unresolved');
    if (currentIndex === targetIndex) return fail('variant-already-current');
    if (!controls.previous && !controls.next) return fail('native-control-unavailable');
    // The pager must be the one attached to the message whose variant we are
    // changing; a pager owned by the other message in this turn is not ours.
    if (controls.ownerId && ownerId && controls.ownerId !== ownerId) {
      return fail('native-control-owner-mismatch');
    }
    // The control must agree with the graph about how many variants exist and
    // which one is displayed; any disagreement is ambiguity, not a hint.
    const indicator = String(controls.indicator || '');
    const parts = indicator.split('/');
    const shownPosition = Number(parts[0] || 0);
    const shownTotal = Number(parts[1] || 0);
    if (!shownTotal || shownTotal !== siblings.length) return fail('variant-count-mismatch');
    if (shownPosition !== currentIndex + 1) return fail('variant-position-mismatch');
    const steps = targetIndex - currentIndex;
    const direction = steps > 0 ? 'next' : 'previous';
    const button = direction === 'next' ? controls.next : controls.previous;
    if (!button) return fail('native-direction-control-unavailable');
    if (Math.abs(steps) > CHAT_ATLAS_CONVERGENCE_MAX_STEPS) return fail('variant-distance-exceeded');
    return Object.freeze({
      ok: true,
      button,
      direction,
      steps: Math.abs(steps),
      siblingCount: siblings.length,
      currentIndex,
      targetIndex,
      kind,
      ownerId,
    });
  }

  function chatAtlasConvergenceScopeCurrent(record) {
    const transaction = chatAtlasBranchTransactionCurrent();
    return !!record
      && !!transaction
      && transaction.token === record.token
      && transaction.chatId === String(completeTurnIndexAuthorityState.chatId || '')
      && transaction.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
      && Number(transaction.generation || 0) === Number(completeTurnIndexAuthorityState.generation || 0)
      && record.chatId === transaction.chatId
      && record.routeKey === transaction.routeKey
      && Number(record.generation || 0) === Number(transaction.generation || 0);
  }

  // One bounded convergence attempt. Returns a frozen outcome; never throws.
  function chatAtlasRunNativeConvergence(reason = 'convergence', targetTurns = null) {
    const state = completeTurnIndexAuthorityState;
    const transaction = chatAtlasBranchTransactionCurrent();
    if (!transaction || transaction.state === 'reset') {
      state.nativeConvergenceState = null;
      return Object.freeze({ ok: false, reason: 'no-transaction' });
    }
    const existing = state.nativeConvergenceState;
    // A newer capture (manual user branch/edit selection) owns the route now:
    // the older convergence action is inert and must never be replayed.
    if (existing && existing.token !== transaction.token) {
      chatAtlasConvergenceTrace('convergence-superseded', { reason: existing.token });
      state.nativeConvergenceState = null;
    }
    if (state.nativeConvergenceState?.phase === 'fail-closed') {
      return Object.freeze({ ok: false, reason: state.nativeConvergenceState.reason });
    }
    const mismatch = chatAtlasFirstNativePathMismatch(targetTurns);
    if (!mismatch) {
      // Every mounted branch point agrees. Convergence is only COMPLETE when
      // the descendants actually materialised through the terminal turn; an
      // agreeing but short prefix is the host failing to expand, and it is
      // reported as exactly that rather than being called success.
      const map = chatAtlasMapMountedNativePath();
      const complete = targetTurns ? true : map.terminalMounted === true;
      if (state.nativeConvergenceState) {
        state.nativeConvergenceState = Object.freeze({
          ...state.nativeConvergenceState,
          phase: complete ? 'confirmed' : 'fail-closed',
          reason: complete ? 'native-path-matches-through-terminal' : 'native-prefix-short-of-terminal',
          prefixLength: map.prefixLength,
          pathLength: map.pathLength,
        });
        chatAtlasConvergenceTrace(complete ? 'convergence-confirmed' : 'convergence-fail-closed', {
          reason: complete ? reason : `prefix-short:${map.prefixLength}/${map.pathLength}`,
        });
      }
      return Object.freeze({
        ok: complete,
        reason: complete ? 'native-path-matches-through-terminal' : 'native-prefix-short-of-terminal',
        converged: complete,
        prefixLength: map.prefixLength,
        pathLength: map.pathLength,
      });
    }
    // A proven activation must change the native identity it acted on. If the
    // same branch point is still mounted with the same identities after we
    // already activated its control, clicking again is not convergence.
    const priorRecord = state.nativeConvergenceState;
    const mismatchSignature = `${mismatch.kind}|${mismatch.expectedOrder}|${mismatch.mountedQId}|${mismatch.mountedAId}`;
    if (
      priorRecord
      && priorRecord.phase === 'activated'
      && String(priorRecord.mismatchSignature || '') === mismatchSignature
    ) {
      state.nativeConvergenceState = Object.freeze({
        ...priorRecord,
        phase: 'fail-closed',
        reason: 'activation-produced-no-identity-change',
      });
      chatAtlasConvergenceTrace('convergence-fail-closed', { reason: 'no-identity-change' });
      return Object.freeze({ ok: false, reason: 'activation-produced-no-identity-change' });
    }
    const attempts = Number(state.nativeConvergenceState?.attempts || 0);
    if (attempts >= CHAT_ATLAS_CONVERGENCE_MAX_STEPS) {
      state.nativeConvergenceState = Object.freeze({
        token: transaction.token,
        chatId: transaction.chatId,
        routeKey: transaction.routeKey,
        generation: transaction.generation,
        phase: 'fail-closed',
        reason: 'convergence-attempts-exhausted',
        attempts,
      });
      chatAtlasConvergenceTrace('convergence-fail-closed', { reason: 'attempts-exhausted' });
      return Object.freeze({ ok: false, reason: 'convergence-attempts-exhausted' });
    }
    const proof = chatAtlasProveConvergenceStep(mismatch);
    if (proof.ok !== true) {
      state.nativeConvergenceState = Object.freeze({
        token: transaction.token,
        chatId: transaction.chatId,
        routeKey: transaction.routeKey,
        generation: transaction.generation,
        phase: 'fail-closed',
        reason: proof.reason,
        attempts,
        expectedQId: mismatch.expectedQId,
        mountedQId: mismatch.mountedQId,
      });
      chatAtlasConvergenceTrace('convergence-fail-closed', { reason: proof.reason });
      return Object.freeze({ ok: false, reason: proof.reason });
    }
    const record = {
      token: transaction.token,
      chatId: transaction.chatId,
      routeKey: transaction.routeKey,
      generation: transaction.generation,
      expectedQId: mismatch.expectedQId,
      expectedPrimaryAId: mismatch.expectedPrimaryAId,
      mountedQId: mismatch.mountedQId,
      mountedAId: mismatch.mountedAId,
      phase: 'activated',
      reason: 'variant-proven',
      attempts: attempts + 1,
      direction: proof.direction,
      steps: proof.steps,
      kind: proof.kind,
      ownerId: proof.ownerId,
      expectedOrder: Number(mismatch.expectedOrder || 0),
      mismatchSignature,
    };
    if (!chatAtlasConvergenceScopeCurrent(record)) {
      chatAtlasConvergenceTrace('convergence-fail-closed', { reason: 'scope-drift' });
      return Object.freeze({ ok: false, reason: 'scope-drift' });
    }
    state.nativeConvergenceState = Object.freeze(record);
    // Our own activation is the execution of an ALREADY captured user intent,
    // not a new one: suppress trusted capture for its duration so it cannot
    // open a competing transaction or supersede the branch it is serving.
    state.nativeConvergenceActivating = true;
    let clicked = 0;
    try {
      for (let step = 0; step < proof.steps; step += 1) {
        try { proof.button.click(); clicked += 1; } catch { break; }
      }
    } finally {
      state.nativeConvergenceActivating = false;
    }
    chatAtlasConvergenceTrace('convergence-activated', {
      reason: `${proof.kind}@${mismatch.expectedOrder}:${proof.direction}:${clicked}`,
    });
    if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
    return Object.freeze({
      ok: true,
      reason: 'variant-activated',
      kind: proof.kind,
      direction: proof.direction,
      steps: proof.steps,
      clicked,
      expectedQId: mismatch.expectedQId,
      expectedPrimaryAId: mismatch.expectedPrimaryAId,
    });
  }

  // Post-activation proof: the mounted identity at that exact position must
  // now BE the expected one. Anything else is not convergence.
  function chatAtlasConfirmNativeConvergence(reason = 'convergence-confirm') {
    const record = completeTurnIndexAuthorityState.nativeConvergenceState;
    if (!record || record.phase !== 'activated') return false;
    if (!chatAtlasConvergenceScopeCurrent(record)) {
      completeTurnIndexAuthorityState.nativeConvergenceState = null;
      chatAtlasConvergenceTrace('convergence-superseded', { reason: 'scope-drift' });
      return false;
    }
    let mountedQ = null;
    try {
      mountedQ = D.querySelector(`[data-message-author-role="user"][data-message-id="${record.expectedQId}"]`);
    } catch {}
    if (!mountedQ) return false;
    // A regeneration step only landed when the expected ANSWER is mounted too.
    if (record.kind === 'assistant-regeneration' && record.expectedPrimaryAId) {
      let mountedA = null;
      try {
        mountedA = D.querySelector(`[data-message-author-role="assistant"][data-message-id="${record.expectedPrimaryAId}"]`);
      } catch {}
      if (!mountedA) return false;
    }
    // The step landed. The TRANSACTION is only confirmed when no branch point
    // still disagrees and the path materialised through its terminal turn;
    // otherwise convergence continues at the next proven branch point.
    const remaining = chatAtlasFirstNativePathMismatch();
    const map = chatAtlasMapMountedNativePath();
    const complete = !remaining && map.terminalMounted === true;
    completeTurnIndexAuthorityState.nativeConvergenceState = Object.freeze({
      ...record,
      phase: complete ? 'confirmed' : 'converging',
      reason: complete ? 'expected-identity-mounted' : 'step-landed-path-incomplete',
      prefixLength: map.prefixLength,
      pathLength: map.pathLength,
    });
    chatAtlasConvergenceTrace(complete ? 'convergence-confirmed' : 'convergence-step-landed', {
      reason: complete ? reason : `${record.kind || 'question-edit'}@${record.expectedOrder || 0}`,
    });
    return true;
  }

  function chatAtlasCompleteIndexNativeBranchButton(event) {
    const branchLabel = (node) => {
      if (String(node?.tagName || '').toUpperCase() !== 'BUTTON') return '';
      const label = String(node?.getAttribute?.('aria-label') || '').trim().toLowerCase();
      return (label === 'previous response' || label === 'next response') ? label : '';
    };
    try {
      const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
      for (const node of Array.isArray(path) ? path : []) {
        if (branchLabel(node)) return node;
      }
    } catch {}
    let closest = null;
    try { closest = event?.target?.closest?.('button') || null; } catch { closest = null; }
    return closest && branchLabel(closest) ? closest : null;
  }

  function chatAtlasCompleteIndexNativeBranchDirection(event) {
    if (event?.isTrusted !== true) return '';
    const button = chatAtlasCompleteIndexNativeBranchButton(event);
    const label = String(button?.getAttribute?.('aria-label') || '').trim().toLowerCase();
    if (label === 'previous response') return 'previous';
    if (label === 'next response') return 'next';
    return '';
  }

  function chatAtlasTrustedNativeBranchOwnership(event) {
    // DOM topology may only IDENTIFY the clicked branch control's candidate
    // message IDs (nested SVG/span targets included). Durable authority comes
    // exclusively from a UNIQUE match against the host-proven canonical index:
    // a user message ID must equal exactly one canonical qId, or an assistant
    // answer ID must belong to exactly one canonical turn (primary or same-qId
    // variant). Zero matches, duplicate ownership, or candidates resolving to
    // different turns all fail closed to an untrusted (token-free) capture.
    const button = chatAtlasCompleteIndexNativeBranchButton(event);
    if (!button) return { ok: false, qId: '', reason: 'capture-owner-unresolved' };
    // The real ChatGPT layout groups a turn's user/assistant messages and its
    // Previous/Next branch controls under one conversation-turn container
    // (<div data-testid="conversation-turn-N">) — NOT an <article>. Resolve
    // the owning scope in that order first (the same anchor existing browser
    // scripts use via closest('[data-testid^="conversation-turn-"]')), then
    // keep the legacy article / message-id ancestors as bounded fallbacks.
    let scope = null;
    try {
      scope = button.closest?.('[data-testid^="conversation-turn-"]')
        || button.closest?.('article')
        || button.closest?.('[data-message-id]')
        || null;
    } catch { scope = null; }
    const candidates = [];
    try {
      const nodes = scope?.querySelectorAll?.('[data-message-id]') || [];
      for (const node of nodes) candidates.push(node);
    } catch {}
    if (!candidates.length && scope?.getAttribute?.('data-message-id')) candidates.push(scope);
    const userIds = [];
    const assistantIds = [];
    for (const node of candidates) {
      const id = chatAtlasCompleteIndexIdentity(node?.getAttribute?.('data-message-id'));
      if (!id) continue;
      const role = String(node?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase();
      if (role === 'user' && !userIds.includes(id)) userIds.push(id);
      if (role === 'assistant' && !assistantIds.includes(id)) assistantIds.push(id);
    }
    if (!userIds.length && !assistantIds.length) {
      return { ok: false, qId: '', reason: 'capture-owner-unresolved' };
    }
    const turns = Array.isArray(completeTurnIndexAuthorityState.index?.turns)
      ? completeTurnIndexAuthorityState.index.turns
      : [];
    if (!turns.length) return { ok: false, qId: '', reason: 'capture-owner-not-canonical' };
    const resolved = new Set();
    let userResolved = false;
    let answerResolved = false;
    for (const id of userIds) {
      const owners = turns.filter((turn) => turn?.qId === id);
      if (owners.length > 1) return { ok: false, qId: '', reason: 'capture-owner-ambiguous' };
      if (owners.length === 1) {
        resolved.add(owners[0].qId);
        userResolved = true;
      }
    }
    for (const id of assistantIds) {
      const owners = turns.filter((turn) => turn?.primaryAId === id
        || (Array.isArray(turn?.answerVariants) && turn.answerVariants.includes(id)));
      if (owners.length > 1) return { ok: false, qId: '', reason: 'capture-owner-ambiguous' };
      if (owners.length === 1) {
        resolved.add(owners[0].qId);
        answerResolved = true;
      }
    }
    if (!resolved.size) return { ok: false, qId: '', reason: 'capture-owner-not-canonical' };
    if (resolved.size > 1) return { ok: false, qId: '', reason: 'capture-owner-ambiguous' };
    // The clicked branch control is the CURRENT assistant answer's pager, so
    // when an assistant answer id uniquely identifies the owning turn that is
    // the branch-specific signal — report it as the resolution method even if
    // the same turn's user qId also matched (both agree on one turn here).
    return {
      ok: true,
      qId: resolved.values().next().value,
      currentAnswerId: assistantIds.length === 1 ? assistantIds[0] : '',
      reason: answerResolved ? 'capture-owner-answer-resolved' : 'capture-owner-qid-resolved',
    };
  }

  function chatAtlasRecordTrustedNativeBranchSelection(event) {
    // Convergence activates a native control to EXECUTE the already captured
    // intent. Treating that synthetic click as a new user selection would
    // open a competing transaction and supersede the branch it is serving.
    if (completeTurnIndexAuthorityState.nativeConvergenceActivating === true) return false;
    const direction = chatAtlasCompleteIndexNativeBranchDirection(event);
    const route = chatAtlasFullIndexRoute();
    if (
      !direction
      || !completeTurnIndexAuthorityState.enabled
      || !route.chatId
      || route.chatId !== completeTurnIndexAuthorityState.chatId
      || route.routeKey !== completeTurnIndexAuthorityState.routeKey
    ) {
      if (direction) {
        chatAtlasTraceTrustedLifecycle('trusted-capture-rejected', {
          direction,
          chat: route.chatId || '',
          reason: !completeTurnIndexAuthorityState.enabled
            ? 'authority-disabled'
            : (!route.chatId
              ? 'route-chat-missing'
              : (route.chatId !== completeTurnIndexAuthorityState.chatId
                ? 'chat-mismatch'
                : 'route-mismatch')),
        });
      }
      return false;
    }
    const observedAt = Date.now();
    const priorIntent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const priorEffectiveIndex = typeof getEffectivePresentationIndex === 'function'
      ? getEffectivePresentationIndex()
      : completeTurnIndexAuthorityState.index;
    const priorEffectiveCount = Array.isArray(priorEffectiveIndex?.turns)
      ? priorEffectiveIndex.turns.length
      : 0;
    const priorEffectiveFingerprint = String(priorEffectiveIndex?.sourceFingerprint || '');
    const priorPresentationStatus = typeof getEffectivePresentationStatus === 'function'
      ? getEffectivePresentationStatus()
      : null;
    const branchButton = chatAtlasCompleteIndexNativeBranchButton(event);
    const eventStamp = Number(event?.timeStamp);
    let scopeIdentity = '';
    try {
      const scope = branchButton?.closest?.('[data-testid^="conversation-turn-"]') || null;
      scopeIdentity = String(scope?.getAttribute?.('data-testid') || '').trim().slice(0, 128);
    } catch {}
    const deliveryIdentity = (
      branchButton
      && Number.isFinite(eventStamp)
      && eventStamp > 0
    )
      ? `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
        Number(completeTurnIndexAuthorityState.generation || 0),
        route.chatId,
        route.routeKey,
        direction,
        String(event?.type || 'click').slice(0, 16),
        eventStamp,
        Number(event?.detail || 0),
        Number(event?.button || 0),
        Number(event?.pointerId || 0),
        scopeIdentity,
      ]))}`
      : '';
    const duplicateDelivery = !!priorIntent
      && !!deliveryIdentity
      && deliveryIdentity === String(priorIntent.deliveryIdentity || '')
      && Math.max(0, observedAt - Number(priorIntent.observedAt || 0)) <= 1000;
    if (duplicateDelivery) {
      chatAtlasTraceTrustedLifecycle('trusted-capture-deduplicated', {
        direction,
        chat: route.chatId,
        qId: priorIntent.qId,
        token: priorIntent.token,
        reason: 'same-native-click-delivery',
      });
      if (typeof scheduleChatAtlasLedgerFlush === 'function') {
        scheduleChatAtlasLedgerFlush('trusted-native-branch-click-deduplicated');
      }
      return true;
    }
    if (typeof chatAtlasResetBranchExpansionLifecycle === 'function') {
      chatAtlasResetBranchExpansionLifecycle('newer-trusted-capture');
    }
    completeTurnIndexAuthorityState.trustedSelectionSequence += 1;
    completeTurnIndexAuthorityState.trustedSelectionCaptureCount += 1;
    const tokenIdentity = [
      Number(completeTurnIndexAuthorityState.generation || 0),
      route.chatId,
      route.routeKey,
      completeTurnIndexAuthorityState.trustedSelectionSequence,
      direction,
      observedAt,
    ];
    const token = `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(tokenIdentity))}`;
    chatAtlasTraceTrustedLifecycle('trusted-capture-created', {
      direction,
      chat: route.chatId,
      token,
    });
    if (priorIntent) {
      chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
        reason: 'superseded-by-newer-capture',
        qId: priorIntent.qId,
        token: priorIntent.token,
      });
    }
    // The clicked control's owning canonical qId resolves and freezes NOW, at
    // capture, from DOM topology verified against the host-proven index. The
    // intent never binds lazily to a first-observed changed turn: a capture
    // whose ownership is unresolved, non-canonical, or ambiguous produces NO
    // trusted intent and the click degrades to generic untrusted observation.
    const ownership = chatAtlasTrustedNativeBranchOwnership(event);
    chatAtlasTraceTrustedLifecycle('trusted-bind-attempt', { token, qId: ownership.qId });
    if (ownership.ok !== true) {
      if (priorIntent) {
        completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
        if (typeof chatAtlasClearSelectedPathOverlay === 'function') {
          chatAtlasClearSelectedPathOverlay('trusted-intent-superseded');
        }
        if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
          chatAtlasClearSelectedPathAcquisition('trusted-intent-superseded', {
            preserveGraph: true,
            resetRefetchGuard: true,
          });
        }
      }
      // A newer click that fails ownership must still cancel any prior click's
      // pending post-event reconciliation task.
      chatAtlasCancelTrustedNativeBranchReconcile();
      chatAtlasTraceTrustedLifecycle('trusted-bind-skipped', { reason: ownership.reason, token });
      return false;
    }
    chatAtlasTraceTrustedLifecycle('trusted-bind-success', {
      qId: ownership.qId,
      token,
      reason: ownership.reason,
    });
    const generation = Number(completeTurnIndexAuthorityState.generation || 0);
    const staleAlreadyCurrent = completeTurnIndexAuthorityState.branchSelectionStale === true
      && String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '') === ownership.qId
      && String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '') === route.chatId
      && String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '') === route.routeKey
      && Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0) === generation;
    const staleRevision = staleAlreadyCurrent
      ? Math.max(1, Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0))
      : Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0) + 1;
    const priorPresentationSource = priorPresentationStatus?.overlayActive === true
      ? 'selected-path-overlay'
      : (typeof selectedPathAcquisitionState !== 'undefined'
        && selectedPathAcquisitionState.graph
        ? 'retained-selected-path-graph'
        : String(priorPresentationStatus?.source || ''));
    const returnTargetCandidate = typeof chatAtlasCaptureBranchReturnCandidate === 'function'
      ? chatAtlasCaptureBranchReturnCandidate({
        token,
        qId: ownership.qId,
        priorAnswerId: ownership.currentAnswerId,
        direction,
        chatId: route.chatId,
        routeKey: route.routeKey,
        generation,
        staleRevision,
        priorEffectiveCount,
        priorEffectiveFingerprint,
        priorPresentationSource,
      }, priorEffectiveIndex)
      : null;
    if (typeof chatAtlasClearSelectedPathOverlay === 'function') {
      chatAtlasClearSelectedPathOverlay(
        priorIntent ? 'trusted-intent-superseded' : 'trusted-intent-created',
      );
    }
    if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
      chatAtlasClearSelectedPathAcquisition(
        priorIntent ? 'trusted-intent-superseded' : 'trusted-intent-created',
        {
          preserveGraph: true,
          resetRefetchGuard: true,
        },
      );
    }
    // The ownership and route checks above have already proven the exact
    // canonical qId and scope. Mark only this memory-only passive state; the
    // reconciliation scheduler below remains independently gated.
    completeTurnIndexAuthorityState.branchSelectionStale = true;
    completeTurnIndexAuthorityState.branchSelectionStaleRevision = staleRevision;
    completeTurnIndexAuthorityState.branchSelectionStaleQId = ownership.qId;
    completeTurnIndexAuthorityState.branchSelectionStaleChatId = route.chatId;
    completeTurnIndexAuthorityState.branchSelectionStaleRouteKey = route.routeKey;
    completeTurnIndexAuthorityState.branchSelectionStaleGeneration = generation;
    completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({
      token,
      chatId: route.chatId,
      routeKey: route.routeKey,
      generation,
      direction,
      qId: ownership.qId,
      priorAnswerId: ownership.currentAnswerId,
      staleRevision,
      observedAt,
      openedAt: observedAt,
      priorEffectiveCount,
      priorEffectiveFingerprint,
      returnTargetCandidate,
      deliveryIdentity,
      interactionIdentity: `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
        deliveryIdentity,
        ownership.qId,
        ownership.currentAnswerId,
        direction,
      ]))}`,
    });
    // The production runtime owns this notifier. Isolated function-extraction
    // This is a genuine trusted user branch action — self-generated
    // convergence clicks returned above and never reach here. It takes
    // ownership of the session, so the default newest-created origin becomes
    // inert until a reload or a route/generation reset.
    try { chatAtlasMarkManualBranchOverride('trusted-native-branch-click'); } catch {}
    // harnesses may intentionally omit it while still exercising Gate 5.
    if (typeof chatAtlasNotifyCompleteIndexState === 'function') chatAtlasNotifyCompleteIndexState();
    if (typeof scheduleChatAtlasLedgerFlush === 'function') {
      // A newer manual selection owns the route: the older convergence action
      // is inert and must never force the previous route back.
      completeTurnIndexAuthorityState.nativeConvergenceState = null;
      chatAtlasOpenBranchTransaction(completeTurnIndexAuthorityState.trustedSelectedPathIntent);
      scheduleChatAtlasLedgerFlush('trusted-native-branch-click');
    }
    // The captured qId is already uniquely and canonically known, so trusted
    // reconciliation is DRIVEN by the capture — it never waits for generic
    // live-change inspection to rediscover this qId (the real ChatGPT branch
    // transition only reports downstream changed turns, so that rediscovery
    // never happens). Defer past native event propagation, then enqueue one
    // bounded trusted request for this exact qId/token through the coordinator.
    chatAtlasScheduleTrustedNativeBranchReconcile(token);
    return true;
  }

  function chatAtlasCancelTrustedNativeBranchReconcile() {
    if (completeTurnIndexAuthorityState.trustedNativeReconcileTask != null) {
      try { (W.clearTimeout || clearTimeout)(completeTurnIndexAuthorityState.trustedNativeReconcileTask); } catch {}
      completeTurnIndexAuthorityState.trustedNativeReconcileTask = null;
    }
  }

  function chatAtlasScheduleTrustedNativeBranchReconcile(token) {
    // A real native branch click is user-driven work, not automatic
    // reconciliation: it always schedules its single bounded post-event task,
    // memory canary or not. The Round 1 canary continues to gate only the
    // generic-inspection (automatic) lane, whose evidence stays untrusted
    // while the canary is false. Without this, a fresh reload (canary always
    // false) left every branch click with a bound intent that nothing ever
    // consumed: zero fetches, hundreds of rejected signals, and authority
    // stuck on the outgoing branch.
    // One post-event task per trusted token. A newer click cancels the prior
    // task (and the run guard re-checks the live token anyway).
    chatAtlasCancelTrustedNativeBranchReconcile();
    completeTurnIndexAuthorityState.trustedNativeReconcileTask = (W.setTimeout || setTimeout)(() => {
      completeTurnIndexAuthorityState.trustedNativeReconcileTask = null;
      chatAtlasRunTrustedNativeBranchReconcile(token);
    }, 0);
  }

  function chatAtlasRunTrustedNativeBranchReconcile(token) {
    // Re-validate the live intent by exact qId: token match plus the standard
    // route/chat/generation/gate/age authority the lookup enforces. Any change
    // since capture (route/gate/generation/supersede/expiry) leaves this a
    // safe no-op, so the post-event task is fully token/route/gate scoped.
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    if (!intent || intent.token !== token) return;
    const current = chatAtlasCurrentTrustedNativeBranchSelection(intent.qId);
    if (!current || current.token !== token) return;
    const evidence = chatAtlasCompleteIndexSelectedPathEvidence('trusted-native-branch-click', {
      qId: intent.qId,
    });
    if (!evidence || evidence.trusted !== true || evidence.selectionToken !== token) return;
    chatAtlasTraceTrustedLifecycle('trusted-native-branch-click', {
      qId: intent.qId,
      token,
      direction: intent.direction,
    });
    // The complete identity graph is commonly retained by the initial full
    // index load before the native branch click. Re-evaluate that current
    // graph after native event propagation instead of waiting for another
    // byte-identical host envelope to arrive. A missing graph remains the
    // coordinator's bounded acquisition case; any terminal derivation result
    // retains the transaction decision made by the single publication owner.
    const retainedPublication = chatAtlasTryPublishRetainedBranchTransaction(
      'trusted-native-retained-graph',
    );
    if (retainedPublication?.published === true) return;
    if (
      retainedPublication?.handled === true
      && retainedPublication.reason !== 'branch-transaction-graph-pending'
    ) return;
    void chatAtlasScheduleCompleteIndexRefresh(evidence.cause, { selectedPathEvidence: evidence });
  }

  function chatAtlasCurrentTrustedNativeBranchSelection(qIdRaw = '') {
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    if (!intent) return null;
    const qId = chatAtlasCompleteIndexIdentity(qIdRaw);
    const age = Math.max(0, Date.now() - Number(intent.observedAt || 0));
    // Route/generation/age carry the click's genuine authority; only those
    // expire the shared trusted intent. The intent's qId is resolved and
    // frozen AT CAPTURE from the clicked control's canonically verified owner
    // (chatAtlasTrustedNativeBranchOwnership); a lookup can therefore only
    // ever match that exact qId. There is no lazy binding, so a
    // mid-conversation cascade's other changed turns can never adopt,
    // consume, or destroy the trusted token — the live
    // GATE_5_BRANCH_CONFIRMATION_NOT_REFLECTED wrong-first-turn binding.
    const expansionPending = completeTurnIndexAuthorityState.branchExpansionState === 'pending'
      && completeTurnIndexAuthorityState.branchExpansionLease?.token === intent.token;
    let requestOwnedRefetch = false;
    if (typeof selectedPathAcquisitionState !== 'undefined') {
      const acquisition = selectedPathAcquisitionState;
      const acquisitionScopeCurrent = acquisition.token === intent.token
        && acquisition.refetchAttemptedForToken === intent.token
        && acquisition.refetchActiveForToken === intent.token
        && acquisition.anchorQId === intent.qId
        && acquisition.chatId === intent.chatId
        && acquisition.routeKey === intent.routeKey
        && Number(acquisition.generation || 0) === Number(intent.generation || 0)
        && Number(acquisition.staleRevision || 0) === Number(intent.staleRevision || 0);
      if (acquisitionScopeCurrent && typeof completeIndexRefreshCoordinator !== 'undefined') {
        try {
          requestOwnedRefetch = completeIndexRefreshCoordinator
            ?.selectedPathRequestOwnsIntent?.(intent) === true;
        } catch {}
      }
    }
    const returnExpansionWindow = typeof chatAtlasPreExpansionCanonicalReturnWindow === 'function'
      ? chatAtlasPreExpansionCanonicalReturnWindow(intent)
      : Object.freeze({ active: false });
    const allowedAgeMs = returnExpansionWindow.active === true
      ? CHAT_ATLAS_BRANCH_EXPANSION_MAX_MS
      : Number(COMPLETE_TURN_INDEX_REFRESH_LIMITS.trustedSelectionWindowMs || 5000);
    const activeTransaction = chatAtlasBranchTransactionCurrent();
    const transactionOwned = activeTransaction?.state === 'pending'
      && activeTransaction.token === intent.token;
    const ageExpired = !expansionPending
      && !requestOwnedRefetch
      && !transactionOwned
      && age > allowedAgeMs;
    const authoritative = completeTurnIndexAuthorityState.enabled
      && intent.chatId === completeTurnIndexAuthorityState.chatId
      && intent.routeKey === completeTurnIndexAuthorityState.routeKey
      && intent.generation === Number(completeTurnIndexAuthorityState.generation || 0)
      && !ageExpired;
    if (!authoritative) {
      if (ageExpired && returnExpansionWindow.active === true) {
        chatAtlasFailClosedPreExpansionReturn(intent, returnExpansionWindow);
        return null;
      }
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
      // Expiry retires the INTENT, not the outcome. A selection whose branch
      // transaction already published owns the acquisition record until the
      // normal route/generation reset clears it; clearing here rewrote a
      // completed selection into a false 'trusted-intent-expired'.
      if (
        typeof chatAtlasClearSelectedPathAcquisition === 'function'
        && !chatAtlasSelectedPathPublishedForToken(intent.token)
      ) {
        chatAtlasClearSelectedPathAcquisition(
          ageExpired ? 'trusted-intent-expired' : 'trusted-intent-scope-changed',
          { preserveGraph: true },
        );
      }
      chatAtlasTraceTrustedLifecycle(ageExpired ? 'trusted-intent-expired' : 'trusted-intent-cleared', {
        reason: ageExpired
          ? 'age-window-exceeded'
          : (!completeTurnIndexAuthorityState.enabled
            ? 'authority-disabled'
            : (intent.chatId !== completeTurnIndexAuthorityState.chatId
              ? 'chat-mismatch'
              : (intent.routeKey !== completeTurnIndexAuthorityState.routeKey
                ? 'route-mismatch'
                : 'generation-mismatch'))),
        qId: intent.qId || qId,
        token: intent.token,
        age,
      });
      return null;
    }
    if (!qId || intent.qId !== qId) {
      if (qId) {
        chatAtlasTraceTrustedLifecycle('trusted-bind-skipped', {
          reason: 'trusted-qid-mismatch',
          qId,
          boundQId: intent.qId,
          token: intent.token,
        });
      }
      return null;
    }
    return intent;
  }

  function chatAtlasCompleteIndexSelectedPathEvidenceCurrent(evidence) {
    const intent = chatAtlasCurrentTrustedNativeBranchSelection(evidence?.qId);
    return !!intent && !!evidence?.selectionToken && intent.token === evidence.selectionToken;
  }

  function chatAtlasCompleteIndexSelectedPathLeaseCurrent(evidence) {
    // Lease validity for a trusted request the coordinator has ALREADY
    // accepted. The five-second capture age window governed capture->bind->
    // trusted-schedule and is deliberately NOT re-applied here: a slow but
    // valid provider response must not convert into a false cancellation.
    // Only a genuinely NEWER trusted capture (a different LIVE token)
    // invalidates the lease; route/chat/gate/generation/reset changes cancel
    // it immediately through the coordinator's own cancel paths instead.
    if (!evidence?.selectionToken) return false;
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    if (intent && intent.token !== evidence.selectionToken) return false;
    if (!intent) {
      chatAtlasTraceTrustedLifecycle('confirmation-lease-retained', {
        qId: evidence.qId,
        token: evidence.selectionToken,
        reason: 'capture-intent-expired',
      });
    }
    return true;
  }

  function chatAtlasResolveTrustedNativeBranchSelection(evidence, resolutionRaw = 'resolved') {
    const resolution = chatAtlasCompleteIndexCode(resolutionRaw, 'resolved', 48);
    if (resolution === 'confirmed') {
      chatAtlasTraceTrustedLifecycle('confirmation-confirmed', {
        qId: evidence?.qId,
        token: evidence?.selectionToken,
        trusted: evidence?.trusted === true,
      });
    } else if (resolution === 'unconfirmed' || resolution === 'failed') {
      chatAtlasTraceTrustedLifecycle('confirmation-unconfirmed', {
        qId: evidence?.qId,
        token: evidence?.selectionToken,
        reason: resolution,
      });
    } else {
      chatAtlasTraceTrustedLifecycle('confirmation-cancelled', {
        qId: evidence?.qId,
        token: evidence?.selectionToken,
        reason: resolution,
      });
    }
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const expansionOwnsIntent = completeTurnIndexAuthorityState.branchExpansionState === 'pending'
      && completeTurnIndexAuthorityState.branchExpansionLease?.token === intent?.token;
    // A client-side branch switch never moves the server's current_node, so
    // the refetch legitimately comes back "unconfirmed" while the selected
    // branch is still being acquired from the graph. Clearing the intent here
    // aborted that in-flight acquisition at its scope-drift guard and froze
    // authority on the outgoing branch. An unconfirmed resolution therefore
    // must not retire the intent while the token-matched acquisition is still
    // in flight (or proven but not yet published as the current overlay).
    // The pending branch transaction — not the refetch flight alone — owns
    // the intent through graph derivation AND atomic publication. Even a host
    // "confirmed" answer at the anchor is not proof that the returned flat
    // index is the complete selected branch; clearing here admitted the live
    // 26-turn current_node prefix before the full graph path could publish.
    const transaction = chatAtlasBranchTransactionCurrent();
    const transactionOwnsIntent = !!intent
      && transaction?.state === 'pending'
      && transaction.token === intent.token;
    if (transactionOwnsIntent) {
      chatAtlasTraceTrustedLifecycle('trusted-intent-retained', {
        reason: `transaction-owns-${resolution}`,
        qId: intent.qId,
        token: intent.token,
      });
      chatAtlasBranchTransactionTrace('resolution-retained', { reason: resolution });
      return;
    }
    if (intent && evidence?.selectionToken === intent.token && !expansionOwnsIntent) {
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
      if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
        chatAtlasClearSelectedPathAcquisition(`trusted-intent-resolved-${resolution}`, { preserveGraph: true });
      }
      chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
        reason: `resolved-${resolution}`,
        qId: intent.qId,
        token: intent.token,
      });
    }
  }

  function chatAtlasCompleteIndexSelectedPathEvidence(causeRaw, detail = {}) {
    const cause = chatAtlasCompleteIndexCode(causeRaw, 'selected-path-changed', 64);
    if (![
      'question-branch-changed',
      'question-selected-path-changed',
      'answer-branch-changed',
      'trusted-native-branch-click',
    ].includes(cause)) return null;
    const captureDriven = cause === 'trusted-native-branch-click';
    const index = completeTurnIndexAuthorityState.index;
    const qId = chatAtlasCompleteIndexIdentity(
      detail?.qId || detail?.questionId || detail?.turn?.qId,
    );
    const observedAnswerId = chatAtlasCompleteIndexIdentity(
      detail?.observedAnswerId
      || detail?.selectedAnswerId
      || detail?.primaryAId
      || detail?.answerId
      || detail?.turn?.primaryAId,
    );
    // The capture-driven request derives its baseline (pre-click) primary from
    // the host-proven canonical index for the captured qId — never from DOM or
    // click direction — so confirmation later depends only on the host payload
    // moving off that baseline.
    const baselineAnswerId = captureDriven
      ? chatAtlasCompleteIndexIdentity(
        (Array.isArray(index?.turns) ? index.turns.find((turn) => turn?.qId === qId) : null)?.primaryAId,
      )
      : '';
    // Round 1 shared reconciliation-authorization gate. The trusted-selection
    // lookup still runs (it preserves the frozen capture intent + canonical qId
    // binding + expiry/route diagnostics that the future passive stale-state
    // badge needs), but while automatic branch reconciliation is DEFERRED the
    // evidence is NOT authorized as trusted and carries NO usable reconciliation
    // token. This is the single narrowest choke point covering EVERY trusted
    // reconciliation entry: the capture-driven Path 1 (run guard) AND the
    // generic-inspection Path 2 (chatAtlasInspectCompleteIndexLiveChanges /
    // chatAtlasHandleCompleteIndexTurnEvent) both obtain their trust here, so
    // neither can schedule a refresh/request/confirmation/mutation when the gate
    // is false. The accepted Gate 5 algorithm is unchanged and re-authorizes
    // the moment the memory-only qualification gate is enabled.
    // Capture-driven evidence (a real native branch click with a live, bound,
    // route-scoped intent) is authorized on its own: the user's click is the
    // authority. The memory canary continues to gate only the generic
    // inspection lane, whose causes are never capture-driven.
    const reconciliationAllowed = completeTurnIndexAuthorityState.autoBranchReconciliationEnabled === true
      || captureDriven === true
      // Ledger-driven selected-path causes are user-driven work while the
      // click's intent is alive: the trusted lookup below still enforces the
      // exact captured anchor (a non-anchor qId resolves null and stays
      // untrusted), so this authorizes only the clicked transition.
      || !!completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const trustedSelection = reconciliationAllowed
      ? chatAtlasCurrentTrustedNativeBranchSelection(qId)
      : null;
    const authorizedToken = reconciliationAllowed ? String(trustedSelection?.token || '') : '';
    const identity = [
      Number(completeTurnIndexAuthorityState.generation || 0),
      String(completeTurnIndexAuthorityState.chatId || ''),
      qId,
      observedAnswerId,
      String(index?.sourceFingerprint || ''),
      String(index?.payloadUpdateTime ?? ''),
      cause,
      authorizedToken,
      captureDriven ? `baseline:${baselineAnswerId}` : '',
    ];
    const evidence = Object.freeze({
      signature: `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(identity))}`,
      cause,
      qId,
      observedAnswerId,
      trusted: reconciliationAllowed && !!trustedSelection,
      selectionToken: authorizedToken,
      baselineAnswerId,
      expectChange: captureDriven,
    });
    chatAtlasTraceTrustedLifecycle('selected-evidence-created', {
      cause,
      qId,
      trusted: evidence.trusted,
      token: evidence.selectionToken,
      signature: evidence.signature,
    });
    return evidence;
  }

  function chatAtlasCompleteIndexSelectedPathConfirmed(index, evidence) {
    if (!index?.complete || !evidence?.qId || !Array.isArray(index?.turns)) return false;
    const turn = index.turns.find((candidate) => candidate?.qId === evidence.qId);
    if (!turn) return false;
    // Capture-driven trusted reconciliation knows the captured turn's PRE-click
    // primary (its canonical baseline) but never the incoming answer — the host
    // payload alone decides that. It is confirmed once the host-proven primary
    // for the captured qId differs from that baseline; direction is never used
    // to guess the new answer. Until then the first refresh stays "unchanged"
    // and schedules exactly one delayed confirmation.
    if (evidence.expectChange === true) {
      return !!evidence.baselineAnswerId && turn.primaryAId !== evidence.baselineAnswerId;
    }
    if (!evidence.observedAnswerId) return true;
    return turn.primaryAId === evidence.observedAnswerId;
  }

  function chatAtlasCompleteIndexCacheKey(chatIdRaw) {
    const chatId = chatAtlasCompleteIndexIdentity(chatIdRaw);
    return chatId ? `${COMPLETE_TURN_INDEX_CACHE_KEY_PREFIX}${chatId}` : '';
  }

  function chatAtlasCompleteIndexExactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).slice().sort();
    const wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
  }

  function chatAtlasNormalizeCompleteIndexEnvelope(raw, chatIdRaw, opts = {}) {
    const source = String(opts?.source || 'host').trim() === 'cache' ? 'cache' : 'host';
    const chatId = chatAtlasCompleteIndexIdentity(chatIdRaw);
    const fail = (errorCode) => ({ ok: false, errorCode, envelope: null });
    if (!chatId || !raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('complete-index-envelope-invalid');
    if (source === 'cache' && !chatAtlasCompleteIndexExactKeys(raw, COMPLETE_TURN_INDEX_CACHE_KEYS)) {
      return fail('complete-index-cache-fields-invalid');
    }
    if (Number(raw?.schema) !== COMPLETE_TURN_INDEX_CACHE_SCHEMA) return fail('complete-index-schema-unsupported');
    if (chatAtlasCompleteIndexIdentity(raw?.chatId) !== chatId) return fail('complete-index-chat-mismatch');
    const complete = source === 'cache' ? raw?.complete === true : raw?.completeness?.complete === true;
    const proof = String(source === 'cache' ? raw?.proof : raw?.completeness?.proof || '').trim();
    if (!complete || proof !== 'host-payload-full-graph') return fail('complete-index-proof-invalid');
    if (!Array.isArray(raw?.turns) || raw.turns.length === 0 || raw.turns.length > 5000) {
      return fail('complete-index-turns-invalid');
    }

    const internalQIds = new Set(COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS);
    const seenQIds = new Set();
    const answerOwners = new Map();
    const turns = [];
    for (let index = 0; index < raw.turns.length; index += 1) {
      const row = raw.turns[index];
      if (!row || typeof row !== 'object' || Array.isArray(row)) return fail('complete-index-row-invalid');
      if (source === 'cache' && !chatAtlasCompleteIndexExactKeys(row, COMPLETE_TURN_INDEX_ROW_KEYS)) {
        return fail('complete-index-row-fields-invalid');
      }
      const order = Number(row?.order);
      const qId = chatAtlasCompleteIndexIdentity(row?.qId);
      const turnId = String(row?.turnId || '').trim();
      if (!Number.isInteger(order) || order !== index + 1 || !qId || turnId !== `turn:${qId}`) {
        return fail('complete-index-row-identity-invalid');
      }
      if (seenQIds.has(qId) || internalQIds.has(qId)) return fail('complete-index-question-identity-invalid');
      seenQIds.add(qId);
      if (!Array.isArray(row?.answerVariants)) return fail('complete-index-answer-variants-invalid');
      const answerVariants = [];
      for (const value of row.answerVariants) {
        const answerId = chatAtlasCompleteIndexIdentity(value);
        if (!answerId || answerVariants.includes(answerId)) return fail('complete-index-answer-identity-invalid');
        const owner = answerOwners.get(answerId);
        if (owner && owner !== qId) return fail('complete-index-answer-ownership-conflict');
        answerOwners.set(answerId, qId);
        answerVariants.push(answerId);
      }
      if (
        answerVariants.some((answerId) => !answerId.startsWith('request-placeholder-'))
        && answerVariants.some((answerId) => answerId.startsWith('request-placeholder-'))
      ) return fail('complete-index-placeholder-invalid');
      const primaryAId = row?.primaryAId == null ? null : chatAtlasCompleteIndexIdentity(row.primaryAId);
      if (row?.primaryAId != null && !primaryAId) return fail('complete-index-primary-invalid');
      if (typeof row?.noAnswer !== 'boolean' || typeof row?.stopped !== 'boolean') {
        return fail('complete-index-answer-state-invalid');
      }
      if (row.noAnswer) {
        if (primaryAId || (answerVariants.length && row.stopped !== true)) {
          return fail('complete-index-no-answer-invalid');
        }
      } else if (!primaryAId || !answerVariants.length || answerVariants[answerVariants.length - 1] !== primaryAId) {
        return fail('complete-index-primary-invalid');
      }
      turns.push(Object.freeze({
        order,
        qId,
        turnId,
        answerVariants: Object.freeze(answerVariants),
        primaryAId,
        noAnswer: row.noAnswer,
        stopped: row.stopped,
      }));
    }

    const sourceFingerprint = String(raw?.sourceFingerprint || '').trim();
    if (!sourceFingerprint || sourceFingerprint !== chatAtlasCompleteIndexFingerprint(turns)) {
      return fail('complete-index-fingerprint-invalid');
    }
    const payloadUpdateTime = raw?.payloadUpdateTime;
    if (payloadUpdateTime != null && typeof payloadUpdateTime !== 'string' && typeof payloadUpdateTime !== 'number') {
      return fail('complete-index-payload-revision-invalid');
    }
    if (typeof payloadUpdateTime === 'number' && !Number.isFinite(payloadUpdateTime)) {
      return fail('complete-index-payload-revision-invalid');
    }
    const capturedAt = String(raw?.capturedAt || '').slice(0, 64);
    const validatedAt = String(
      source === 'cache'
        ? raw?.validatedAt
        : (raw?.completeness?.validatedAt || raw?.capturedAt || new Date().toISOString()),
    ).slice(0, 64);
    if (!capturedAt || !validatedAt) return fail('complete-index-timestamp-invalid');
    const envelope = Object.freeze({
      schema: COMPLETE_TURN_INDEX_CACHE_SCHEMA,
      chatId,
      payloadUpdateTime: payloadUpdateTime == null ? null : payloadUpdateTime,
      sourceFingerprint,
      capturedAt,
      validatedAt,
      complete: true,
      proof: 'host-payload-full-graph',
      turns: Object.freeze(turns),
    });
    return { ok: true, errorCode: null, envelope };
  }

  function chatAtlasCompareCompleteIndexRevision(incomingRaw, retainedRaw) {
    const comparable = (raw) => {
      if (raw == null || raw === '') return { rank: 0, value: 0 };
      if (typeof raw === 'number' && Number.isFinite(raw)) return { rank: 2, value: raw };
      const text = String(raw).trim();
      const numeric = Number(text);
      if (text && Number.isFinite(numeric)) return { rank: 2, value: numeric };
      const timestamp = Date.parse(text);
      if (Number.isFinite(timestamp)) return { rank: 2, value: timestamp };
      return { rank: 1, value: text };
    };
    const incoming = comparable(incomingRaw);
    const retained = comparable(retainedRaw);
    if (incoming.rank !== retained.rank) return incoming.rank > retained.rank ? 1 : -1;
    if (incoming.value === retained.value) return 0;
    return incoming.value > retained.value ? 1 : -1;
  }

  function chatAtlasReadCompleteIndexCache(chatIdRaw) {
    const key = chatAtlasCompleteIndexCacheKey(chatIdRaw);
    if (!key) return { ok: false, status: 'cache-key-invalid', envelope: null, raw: null };
    completeTurnIndexAuthorityState.cacheReadCount += 1;
    let raw = null;
    try { raw = W.localStorage?.getItem?.(key) ?? null; } catch {
      return { ok: false, status: 'cache-read-failed', envelope: null, raw: null };
    }
    if (raw == null || raw === '') return { ok: false, status: 'cache-missing', envelope: null, raw };
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {
      return { ok: false, status: 'cache-json-invalid', envelope: null, raw };
    }
    const normalized = chatAtlasNormalizeCompleteIndexEnvelope(parsed, chatIdRaw, { source: 'cache' });
    return normalized.ok
      ? { ok: true, status: 'cache-valid', envelope: normalized.envelope, raw }
      : { ok: false, status: normalized.errorCode, envelope: null, raw };
  }

  function chatAtlasCompleteIndexCacheIdentityBytes(envelope) {
    return JSON.stringify({
      schema: envelope?.schema,
      chatId: envelope?.chatId,
      payloadUpdateTime: envelope?.payloadUpdateTime ?? null,
      sourceFingerprint: envelope?.sourceFingerprint,
      complete: envelope?.complete === true,
      proof: envelope?.proof,
      turns: envelope?.turns,
    });
  }

  function chatAtlasWriteCompleteIndexCache(envelope) {
    const normalized = chatAtlasNormalizeCompleteIndexEnvelope(envelope, envelope?.chatId, { source: 'cache' });
    const key = chatAtlasCompleteIndexCacheKey(envelope?.chatId);
    if (!key || !normalized.ok) return { ok: false, status: normalized.errorCode || 'cache-key-invalid', bytes: null };
    const bytes = JSON.stringify(normalized.envelope);
    const retainedRaw = completeTurnIndexAuthorityState.cacheRaw;
    if (typeof retainedRaw === 'string' && retainedRaw) {
      try {
        const retainedParsed = JSON.parse(retainedRaw);
        const retained = chatAtlasNormalizeCompleteIndexEnvelope(retainedParsed, envelope?.chatId, { source: 'cache' });
        if (
          retained.ok
          && chatAtlasCompleteIndexCacheIdentityBytes(retained.envelope)
            === chatAtlasCompleteIndexCacheIdentityBytes(normalized.envelope)
        ) {
          completeTurnIndexAuthorityState.cacheWriteSkippedUnchangedCount += 1;
          return { ok: true, status: 'cache-write-skipped-unchanged', bytes: retainedRaw, skipped: true };
        }
      } catch {}
    }
    try {
      W.localStorage?.setItem?.(key, bytes);
      completeTurnIndexAuthorityState.cacheRaw = bytes;
      completeTurnIndexAuthorityState.cacheWriteCount += 1;
      return { ok: true, status: 'cache-written', bytes };
    } catch {
      completeTurnIndexAuthorityState.cacheWriteFailureCount += 1;
      return { ok: false, status: 'cache-write-failed', bytes: null };
    }
  }

  function chatAtlasCompleteIndexAuthorityActive() {
    const route = chatAtlasFullIndexRoute();
    return completeTurnIndexAuthorityState.enabled === true
      && !!route.chatId
      && route.chatId === completeTurnIndexAuthorityState.chatId
      && route.routeKey === completeTurnIndexAuthorityState.routeKey
      && Number.isInteger(completeTurnIndexAuthorityState.generation)
      && completeTurnIndexAuthorityState.generation > 0
      && COMPLETE_TURN_INDEX_COMPLETE_STATUSES.includes(completeTurnIndexAuthorityState.status)
      && completeTurnIndexAuthorityState.index?.complete === true
      && completeTurnIndexAuthorityState.index?.proof === 'host-payload-full-graph'
      && Array.isArray(completeTurnIndexAuthorityState.index?.turns)
      && completeTurnIndexAuthorityState.index.turns.length > 0;
  }

  function chatAtlasCompleteIndexCanonicalDrafts(index = completeTurnIndexAuthorityState.index) {
    if (!index || !Array.isArray(index.turns)) return [];
    return index.turns.map((turn, position) => ({
      turnNo: position + 1,
      qId: turn.qId,
      primaryAId: turn.primaryAId,
      answerIds: turn.answerVariants.slice(),
      aliasIds: [turn.turnId, ...turn.answerVariants],
      hasQuestion: true,
      hasAssistant: !turn.noAnswer,
      noAnswer: turn.noAnswer,
      stopped: turn.stopped,
      completeIndexAuthority: true,
      completenessProvenance: index.proof,
      payloadUpdateTime: index.payloadUpdateTime,
      sourceFingerprint: index.sourceFingerprint,
      structure: {
        segmentId: 1,
        flowIdentity: `complete-index:${index.chatId}`,
        structureKnown: true,
        selectedPathEligible: true,
        pairingContiguous: true,
        currentQuestionProof: true,
        unpairedAssistant: false,
        questionOrdinal: position,
        answerOrdinals: turn.answerVariants.map((_id, answerIndex) => position + answerIndex + 1),
      },
      live: { qEl: null, primaryAEl: null, answerEls: [], connected: false },
    }));
  }

  function chatAtlasCompleteIndexPendingDraftEligible(draft, index) {
    const qId = chatAtlasCompleteIndexIdentity(draft?.qId);
    if (!qId || !draft?.live?.connected || !canonicalDraftHasStructuralQuestionProof(draft)) return false;
    if (COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS.includes(qId)) return false;
    if (index.turns.some((turn) => turn.qId === qId)) return false;
    const answers = (Array.isArray(draft?.answerIds) ? draft.answerIds : [])
      .map((value) => chatAtlasCompleteIndexIdentity(value))
      .filter(Boolean);
    return answers.length === 0 || answers.every((answerId) => isStreamingAnswerPlaceholderId(answerId));
  }

  function chatAtlasQueueCompleteIndexStateNotify() {
    if (completeTurnIndexAuthorityState.pendingStateNotifyQueued) return;
    completeTurnIndexAuthorityState.pendingStateNotifyQueued = true;
    Promise.resolve().then(() => {
      completeTurnIndexAuthorityState.pendingStateNotifyQueued = false;
      if (completeTurnIndexAuthorityState.enabled) chatAtlasNotifyCompleteIndexState();
    });
  }

  function chatAtlasScheduleCompleteIndexRefresh(cause = 'turn-settled', opts = {}) {
    if (!completeTurnIndexAuthorityState.enabled || !completeIndexRefreshCoordinator) {
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const transaction = chatAtlasBranchTransactionCurrent();
    if (opts?.selectedPathEvidence && transaction?.state === 'fail-closed') {
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const retained = selectedPathAcquisitionState.graph;
    const retainedEvaluationCurrent = opts?.selectedPathEvidence
      && transaction?.state === 'pending'
      && transaction.graphCaptureIdentity
      && transaction.graphCaptureIdentity === String(retained?.captureIdentity || '')
      && transaction.graphEvaluationKey === JSON.stringify([
        transaction.token,
        transaction.graphCaptureIdentity,
        chatAtlasCompleteIndexIdentity(
          completeTurnIndexAuthorityState.trustedSelectedPathIntent
            ?.returnTargetCandidate?.targetVariantAnswerId
            || selectedPathAcquisitionState.anchorSelectedAId,
        ),
      ]);
    if (retainedEvaluationCurrent) {
      chatAtlasSelectedPathEvaluate(chatAtlasLedgerState.members);
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    return completeIndexRefreshCoordinator.schedule(cause, opts);
  }

  function chatAtlasInspectCompleteIndexLiveChanges(source, index) {
    if (!completeTurnIndexAuthorityState.enabled || !index?.turns?.length) return;
    const indexedByQId = new Map(index.turns.map((turn) => [turn.qId, turn]));
    const pendingQIds = new Set(completeTurnIndexAuthorityState.pendingDrafts.keys());
    let refreshCause = '';
    let selectedPathEvidence = null;
    // A single trusted native click yields one shared intent that binds to the
    // turn the user switched (the upstream-most changed turn, processed first in
    // document order). A mid-conversation switch also changes downstream turns
    // whose evidence is untrusted; keep the trusted upstream evidence rather
    // than letting a later untrusted (or stopped/null) turn overwrite it.
    const keepSelectedPathEvidence = (evidence) => {
      if (selectedPathEvidence?.trusted === true && evidence?.trusted !== true) {
        chatAtlasTraceTrustedLifecycle('selected-evidence-replaced', {
          reason: 'kept-trusted-evidence',
          cause: evidence?.cause || refreshCause,
          qId: evidence?.qId,
          trusted: false,
        });
        return;
      }
      if (selectedPathEvidence && evidence && evidence !== selectedPathEvidence) {
        chatAtlasTraceTrustedLifecycle('selected-evidence-replaced', {
          reason: 'overwritten',
          cause: evidence.cause,
          qId: evidence.qId,
          trusted: evidence.trusted === true,
          signature: evidence.signature,
        });
      }
      selectedPathEvidence = evidence;
    };
    for (const draft of Array.isArray(source) ? source : []) {
      const qId = chatAtlasCompleteIndexIdentity(draft?.qId);
      if (!qId || COMPLETE_TURN_INDEX_INTERNAL_CONTEXT_QIDS.includes(qId)) continue;
      const answers = (Array.isArray(draft?.answerIds) ? draft.answerIds : [])
        .map((value) => chatAtlasCompleteIndexIdentity(value))
        .filter(Boolean);
      const realAnswers = answers.filter((answerId) => !isStreamingAnswerPlaceholderId(answerId));
      if (pendingQIds.has(qId)) {
        if (realAnswers.length || draft?.stopped === true) refreshCause = draft?.stopped === true ? 'turn-stopped' : 'turn-settled';
        continue;
      }
      const indexed = indexedByQId.get(qId);
      if (!indexed) {
        const selectedPrimary = chatAtlasCompleteIndexIdentity(draft?.primaryAId);
        if (
          canonicalDraftHasStructuralQuestionProof(draft)
          && (realAnswers.length || (!!selectedPrimary && !isStreamingAnswerPlaceholderId(selectedPrimary)))
        ) {
          refreshCause = 'question-selected-path-changed';
          keepSelectedPathEvidence(chatAtlasCompleteIndexSelectedPathEvidence(refreshCause, {
            qId,
            observedAnswerId: selectedPrimary || realAnswers[realAnswers.length - 1] || '',
          }));
        }
        continue;
      }
      const selectedPrimary = chatAtlasCompleteIndexIdentity(draft?.primaryAId);
      const variantChanged = realAnswers.some((answerId) => !indexed.answerVariants.includes(answerId));
      const primaryChanged = !!selectedPrimary
        && !isStreamingAnswerPlaceholderId(selectedPrimary)
        && selectedPrimary !== indexed.primaryAId;
      const stoppedChanged = draft?.stopped === true && indexed.stopped !== true;
      const noAnswerChanged = draft?.noAnswer === true && indexed.noAnswer !== true && draft?.stopped === true;
      if (variantChanged || primaryChanged) {
        refreshCause = 'answer-branch-changed';
        const changedVariant = realAnswers.find((answerId) => !indexed.answerVariants.includes(answerId)) || '';
        keepSelectedPathEvidence(chatAtlasCompleteIndexSelectedPathEvidence(refreshCause, {
          qId,
          observedAnswerId: primaryChanged ? selectedPrimary : changedVariant,
        }));
      } else if (stoppedChanged || noAnswerChanged) {
        refreshCause = 'turn-stopped';
        keepSelectedPathEvidence(null);
      }
    }
    if (refreshCause) {
      void chatAtlasScheduleCompleteIndexRefresh(refreshCause, selectedPathEvidence
        ? { selectedPathEvidence }
        : {});
    }
  }

  function chatAtlasCompleteIndexLiveDrafts(liveDrafts, index) {
    const source = Array.isArray(liveDrafts) ? liveDrafts : [];
    const qIds = new Set(index.turns.map((turn) => turn.qId));
    const answerIds = new Set(index.turns.flatMap((turn) => turn.answerVariants));
    const suppressForeignMembership = chatAtlasBranchTransitionSuppressesLiveAppend();
    for (const qId of qIds) {
      completeTurnIndexAuthorityState.pendingDrafts.delete(qId);
      completeTurnIndexAuthorityState.pendingObservedAt.delete(qId);
    }
    if (suppressForeignMembership) {
      for (const qId of Array.from(completeTurnIndexAuthorityState.pendingDrafts.keys())) {
        if (qIds.has(qId)) continue;
        completeTurnIndexAuthorityState.pendingDrafts.delete(qId);
        completeTurnIndexAuthorityState.pendingObservedAt.delete(qId);
      }
    }
    const eligiblePending = source.filter((draft) => chatAtlasCompleteIndexPendingDraftEligible(draft, index));
    const latestPending = suppressForeignMembership
      ? null
      : (eligiblePending[eligiblePending.length - 1] || null);
    if (suppressForeignMembership && eligiblePending.length) {
      completeTurnIndexAuthorityState.branchTransitionSuppressedLiveAppendCount += eligiblePending.length;
      completeIndexRefreshCoordinator?.markPending?.(0);
    }
    if (latestPending) {
      const alreadyPending = completeTurnIndexAuthorityState.pendingDrafts.has(latestPending.qId);
      const pendingDraft = slimTurnDraft(latestPending);
      completeTurnIndexAuthorityState.pendingDrafts.set(latestPending.qId, {
        ...pendingDraft,
        completeIndexPending: true,
        livePendingProvenance: 'live-pending-overlay',
      });
      if (!alreadyPending) completeTurnIndexAuthorityState.pendingObservedAt.set(latestPending.qId, Date.now());
      completeIndexRefreshCoordinator?.markPending?.(completeTurnIndexAuthorityState.pendingDrafts.size);
      chatAtlasQueueCompleteIndexStateNotify();
    }
    chatAtlasInspectCompleteIndexLiveChanges(source, index);
    const matched = source.filter((draft) => {
      const qId = chatAtlasCompleteIndexIdentity(draft?.qId);
      if (qId && qIds.has(qId)) return true;
      return (Array.isArray(draft?.answerIds) ? draft.answerIds : [])
        .some((answerId) => answerIds.has(chatAtlasCompleteIndexIdentity(answerId)));
    });
    if (latestPending) matched.push(latestPending);
    return matched;
  }

  function chatAtlasCompleteIndexPendingCanonicalDrafts(index) {
    const qIds = new Set(index.turns.map((turn) => turn.qId));
    if (chatAtlasBranchTransitionSuppressesLiveAppend()) {
      let suppressed = 0;
      for (const qId of Array.from(completeTurnIndexAuthorityState.pendingDrafts.keys())) {
        if (qIds.has(qId)) continue;
        completeTurnIndexAuthorityState.pendingDrafts.delete(qId);
        completeTurnIndexAuthorityState.pendingObservedAt.delete(qId);
        suppressed += 1;
      }
      completeTurnIndexAuthorityState.branchTransitionSuppressedLiveAppendCount += suppressed;
      if (suppressed) completeIndexRefreshCoordinator?.markPending?.(0);
      return [];
    }
    const out = [];
    for (const [qId, draft] of completeTurnIndexAuthorityState.pendingDrafts.entries()) {
      if (!qId || qIds.has(qId)) continue;
      out.push({
        ...draft,
        completeIndexPending: true,
        livePendingProvenance: 'live-pending-overlay',
      });
    }
    return out;
  }

  // Branch metadata for the turns on the effective path, keyed by qId. One
  // entry per branching turn; alternatives never become extra entries.
  // ── Effective-path identity accessor (Stage 2C-2aj2) ─────────────────────
  // A NEW getter. getCompleteTurnIndexProjectionStatus() is a pinned surface
  // and stays byte-identical; consumers that must notice a selected-branch
  // change which leaves the canonical envelope untouched read this instead.
  // Read-only and content-free: counts, enums and hashes.
  function getChatAtlasEffectivePathIdentity() {
    let effective = null;
    let status = null;
    try { effective = getEffectivePresentationIndex(); } catch {}
    try { status = getEffectivePresentationStatus(); } catch {}
    const turns = Array.isArray(effective?.turns) ? effective.turns : [];
    const identity = chatAtlasPathIdentityKey(turns);
    return chatAtlasFreeze({
      version: 1,
      available: true,
      effectiveCount: turns.length,
      effectiveFingerprint: String(effective?.sourceFingerprint || '') || null,
      effectivePathIdentity: `djb2:${chatAtlasCompleteIndexStableHash(identity)}`,
      // Folds in chat, generation and overlay-vs-canonical so a selected-branch
      // change is visible even when the canonical envelope is unchanged.
      effectivePathRevision: `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify([
        String(completeTurnIndexAuthorityState.chatId || ''),
        Number(completeTurnIndexAuthorityState.generation || 0),
        status?.overlayActive === true ? 'overlay' : 'canonical',
        identity,
      ]))}`,
      effectiveSource: String(status?.source || 'canonical'),
      overlayActive: status?.overlayActive === true,
      overlayPathLength: Number(status?.pathLength || 0),
    });
  }

  function getChatAtlasBranchBadges() {
    const out = [];
    try {
      for (const [, badge] of chatAtlasEffectivePathBranchBadges()) {
        out.push(Object.freeze({
          qId: badge.qId,
          primaryAId: badge.primaryAId || null,
          questionBranchIndex: Number(badge.questionIndex || 0),
          questionBranchCount: Number(badge.questionCount || 0),
          answerBranchIndex: Number(badge.answerIndex || 0),
          answerBranchCount: Number(badge.answerCount || 0),
        }));
      }
    } catch {}
    return Object.freeze(out);
  }

  function getChatAtlasDefaultLatestCreatedPath() {
    try {
      const result = chatAtlasComputeDefaultLatestCreatedPath();
      return Object.freeze({
        ok: result.ok === true,
        reason: result.reason,
        terminalNodeId: result.terminalNodeId,
        terminalMessageId: result.terminalMessageId,
        terminalCreateTime: result.terminalCreateTime,
        count: result.count,
        fingerprint: result.fingerprint,
        source: result.source,
        branchVector: result.branchVector,
      });
    } catch {
      return Object.freeze({
        ok: false, reason: 'default-path-unavailable', terminalNodeId: null,
        terminalMessageId: null, terminalCreateTime: null, count: 0,
        fingerprint: '', source: 'latest-created-terminal', branchVector: Object.freeze([]),
      });
    }
  }

  function getCompleteTurnIndexProjectionStatus() {
    const index = completeTurnIndexAuthorityState.index;
    const refresh = completeIndexRefreshCoordinator?.getStatus?.() || null;
    const pendingCount = completeTurnIndexAuthorityState.pendingDrafts.size;
    const completeCount = Array.isArray(index?.turns) ? index.turns.length : 0;
    return chatAtlasFreeze({
      canary: COMPLETE_TURN_INDEX_CANARY,
      enabled: completeTurnIndexAuthorityState.enabled,
      memoryOnly: true,
      defaultEnabled: COMPLETE_TURN_INDEX_COMPILED_DEFAULT,
      compiledDefault: COMPLETE_TURN_INDEX_COMPILED_DEFAULT,
      persistedOptInSupported: true,
      activationSource: completeTurnIndexAuthorityState.activationSource,
      status: completeTurnIndexAuthorityState.status,
      authoritative: chatAtlasCompleteIndexAuthorityActive(),
      chatId: completeTurnIndexAuthorityState.chatId,
      routeGeneration: completeTurnIndexAuthorityState.generation,
      count: completeCount,
      completeCount,
      pendingCount,
      projectedCount: completeCount + pendingCount,
      source: completeTurnIndexAuthorityState.indexSource,
      fingerprint: String(index?.sourceFingerprint || '') || null,
      payloadUpdateTime: index?.payloadUpdateTime ?? null,
      completenessProof: String(index?.proof || '') || null,
      fetchCount: completeTurnIndexAuthorityState.fetchCount,
      cacheReadCount: completeTurnIndexAuthorityState.cacheReadCount,
      cacheWriteCount: completeTurnIndexAuthorityState.cacheWriteCount,
      cacheWriteSkippedUnchangedCount: completeTurnIndexAuthorityState.cacheWriteSkippedUnchangedCount,
      cacheWriteFailureCount: completeTurnIndexAuthorityState.cacheWriteFailureCount,
      setterCallCount: completeTurnIndexAuthorityState.setterCallCount,
      automaticSetterCallCount: completeTurnIndexAuthorityState.automaticSetterCallCount,
      preferenceSetterCallCount: completeTurnIndexAuthorityState.preferenceSetterCallCount,
      preferenceReadCount: completeTurnIndexAuthorityState.preferenceReadCount,
      preferenceWriteCount: completeTurnIndexAuthorityState.preferenceWriteCount,
      preferenceClearCount: completeTurnIndexAuthorityState.preferenceClearCount,
      preferenceWriteFailureCount: completeTurnIndexAuthorityState.preferenceWriteFailureCount,
      bootApplyCount: completeTurnIndexAuthorityState.bootApplyCount,
      bootActivationCount: completeTurnIndexAuthorityState.bootActivationCount,
      staleDiscardCount: completeTurnIndexAuthorityState.staleDiscardCount,
      refreshFetchCount: Number(refresh?.fetchCount || 0),
      refreshDebounceCount: Number(refresh?.debounceCount || 0),
      refreshCoalescedCount: Number(refresh?.coalescedCount || 0),
      refreshStaleDiscardCount: Number(refresh?.staleDiscardCount || 0),
      refreshTrailingRequired: refresh?.trailingRequired === true,
      refreshTrailingCount: Number(refresh?.trailingRefreshCount || 0),
      selectedPathSignalCount: Number(refresh?.selectedPathSignalCount || 0),
      selectedPathAcceptanceCount: Number(refresh?.selectedPathAcceptanceCount || 0),
      selectedPathRejectedCount: Number(refresh?.selectedPathRejectedCount || 0),
      selectedPathCancellationCount: Number(refresh?.selectedPathCancellationCount || 0),
      selectedPathDeduplicatedCount: Number(refresh?.selectedPathDeduplicatedCount || 0),
      selectedPathUnconfirmedCount: Number(refresh?.selectedPathUnconfirmedCount || 0),
      selectedPathLastSignature: refresh?.selectedPathLastSignature || null,
      selectedPathActiveSignature: refresh?.selectedPathActiveSignature || null,
      selectedPathActiveTrusted: refresh?.selectedPathActiveTrusted === true,
      selectedPathResultCode: refresh?.selectedPathResultCode || null,
      selectedPathConfirmationPending: refresh?.selectedPathConfirmationPending === true,
      selectedPathConfirmationLeaseActive: refresh?.selectedPathConfirmationLeaseActive === true,
      selectedPathRequestLeaseActive: refresh?.selectedPathRequestLeaseActive === true,
      selectedPathConfirmationScheduledCount: Number(refresh?.selectedPathConfirmationScheduledCount || 0),
      selectedPathConfirmationFetchCount: Number(refresh?.selectedPathConfirmationFetchCount || 0),
      selectedPathConfirmationCancelledCount: Number(refresh?.selectedPathConfirmationCancelledCount || 0),
      trustedSelectionCaptureCount: completeTurnIndexAuthorityState.trustedSelectionCaptureCount,
      trustedSelectionIntentActive: !!completeTurnIndexAuthorityState.trustedSelectedPathIntent,
      trustedSelectionIntentQId: completeTurnIndexAuthorityState.trustedSelectedPathIntent?.qId || null,
      branchSelectionStale: completeTurnIndexAuthorityState.branchSelectionStale === true,
      branchStaleLastClearReason: completeTurnIndexAuthorityState.branchStaleLastClearReason || null,
      branchTransitionSuppressedLiveAppendCount: Number(completeTurnIndexAuthorityState.branchTransitionSuppressedLiveAppendCount || 0),
      branchTransactionPending: chatAtlasBranchTransactionCurrent()?.state === 'pending',
      branchTransactionStateCode: String(completeTurnIndexAuthorityState.branchTransactionState?.state || 'none'),
      branchTransactionReason: String(completeTurnIndexAuthorityState.branchTransactionState?.reason || '') || null,
      nativeConvergencePhase: String(completeTurnIndexAuthorityState.nativeConvergenceState?.phase || 'none'),
      nativeConvergenceReason: String(completeTurnIndexAuthorityState.nativeConvergenceState?.reason || '') || null,
      nativeConvergenceExpectedQId: completeTurnIndexAuthorityState.nativeConvergenceState?.expectedQId || null,
      nativeConvergenceAttempts: Number(completeTurnIndexAuthorityState.nativeConvergenceState?.attempts || 0),
      ...chatAtlasNativeBranchPlanDiagnostics(),
      ...chatAtlasDefaultOverlayDiagnostics(),
      branchTransactionTrace: completeTurnIndexAuthorityState.branchTransactionTrace.map((entry) => Object.freeze({ ...entry })),
      branchSelectionStaleRevision: Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0),
      branchSelectionStaleQId: completeTurnIndexAuthorityState.branchSelectionStaleQId || null,
      branchExpansionPending: completeTurnIndexAuthorityState.branchExpansionState === 'pending',
      branchExpansionFailClosed: completeTurnIndexAuthorityState.branchExpansionState === 'fail-closed',
      branchExpansionState: completeTurnIndexAuthorityState.branchExpansionState,
      branchExpansionReason: completeTurnIndexAuthorityState.branchExpansionReason,
      branchExpansionPriorCount: Number(completeTurnIndexAuthorityState.branchExpansionPriorCount || 0),
      branchExpansionTargetCount: Number(completeTurnIndexAuthorityState.branchExpansionTargetCount || 0),
      branchExpansionExpectedFingerprint:
        String(completeTurnIndexAuthorityState.branchExpansionExpectedFingerprint || '') || null,
      branchExpansionRequiredPageNums: Object.freeze(
        Array.from(completeTurnIndexAuthorityState.branchExpansionRequiredPageNums || []),
      ),
      selectedPathAcquisition: getSelectedPathAcquisitionStatus(),
      selectedPathOverlay: getEffectivePresentationStatus(),
      autoBranchReconciliationEnabled: completeTurnIndexAuthorityState.autoBranchReconciliationEnabled === true,
      autoBranchReconciliationSetterCallCount: completeTurnIndexAuthorityState.autoBranchReconciliationSetterCallCount,
      trustedSelectionLastCaptureTokenHash: completeTurnIndexLifecycleDiagnostics.trustedSelectionLastCaptureTokenHash,
      trustedSelectionLastCaptureDirection: completeTurnIndexLifecycleDiagnostics.trustedSelectionLastCaptureDirection,
      trustedSelectionBindAttemptCount: completeTurnIndexLifecycleDiagnostics.trustedSelectionBindAttemptCount,
      trustedSelectionBindSuccessCount: completeTurnIndexLifecycleDiagnostics.trustedSelectionBindSuccessCount,
      trustedSelectionLastBoundQId: completeTurnIndexLifecycleDiagnostics.trustedSelectionLastBoundQId,
      trustedSelectionClearCount: completeTurnIndexLifecycleDiagnostics.trustedSelectionClearCount,
      trustedSelectionLastClearReason: completeTurnIndexLifecycleDiagnostics.trustedSelectionLastClearReason,
      trustedSelectionLastClearQId: completeTurnIndexLifecycleDiagnostics.trustedSelectionLastClearQId,
      selectedPathTrustedScheduleAttemptCount: completeTurnIndexLifecycleDiagnostics.selectedPathTrustedScheduleAttemptCount,
      selectedPathTrustedScheduleAcceptedCount: completeTurnIndexLifecycleDiagnostics.selectedPathTrustedScheduleAcceptedCount,
      selectedPathLastScheduleTrusted: completeTurnIndexLifecycleDiagnostics.selectedPathLastScheduleTrusted,
      selectedPathLastScheduleQId: completeTurnIndexLifecycleDiagnostics.selectedPathLastScheduleQId,
      selectedPathLastScheduleCause: completeTurnIndexLifecycleDiagnostics.selectedPathLastScheduleCause,
      selectedPathConfirmationEligibilityCheckCount: completeTurnIndexLifecycleDiagnostics.selectedPathConfirmationEligibilityCheckCount,
      selectedPathConfirmationSkipCount: completeTurnIndexLifecycleDiagnostics.selectedPathConfirmationSkipCount,
      selectedPathConfirmationLastSkipReason: completeTurnIndexLifecycleDiagnostics.selectedPathConfirmationLastSkipReason,
      selectedPathLifecycleTraceDroppedCount: completeTurnIndexLifecycleDiagnostics.traceDroppedCount,
      selectedPathLifecycleTrace: completeTurnIndexLifecycleDiagnostics.trace.slice(),
      refreshCauseSample: Array.isArray(refresh?.causeSample) ? refresh.causeSample.slice(0, 8) : [],
      refreshTimerPending: refresh?.timerPending === true,
      refreshRequestActive: refresh?.requestActive === true,
      refreshListenerRegistrationCount: completeTurnIndexAuthorityState.refreshListenerRegistrationCount,
      startedAt: completeTurnIndexAuthorityState.startedAt,
      completedAt: completeTurnIndexAuthorityState.completedAt,
      errorCode: completeTurnIndexAuthorityState.errorCode,
      authorityUnpersisted: completeTurnIndexAuthorityState.authorityUnpersisted === true,
      cacheWriteErrorCode: completeTurnIndexAuthorityState.cacheWriteErrorCode,
      diagnosticStatus: completeTurnIndexAuthorityState.diagnosticStatus,
      cache: {
        schema: COMPLETE_TURN_INDEX_CACHE_SCHEMA,
        key: chatAtlasCompleteIndexCacheKey(completeTurnIndexAuthorityState.chatId),
      },
      preference: {
        key: COMPLETE_TURN_INDEX_PREFERENCE_KEY,
        resolved: completeTurnIndexAuthorityState.preferenceResolved === true,
        storedValue: completeTurnIndexAuthorityState.preferenceStoredValue,
        resolution: completeTurnIndexAuthorityState.preferenceResolution,
        readErrorCode: completeTurnIndexAuthorityState.preferenceReadErrorCode,
        writeErrorCode: completeTurnIndexAuthorityState.preferenceWriteErrorCode,
      },
    });
  }

  function chatAtlasNotifyCompleteIndexState() {
    // The default origin publishes at most once per graph capture; the guard
    // lives inside the publisher, so this hook cannot become a request storm.
    try { chatAtlasPublishDefaultLatestCreatedPath('complete-index-published'); } catch {}
    // One bounded tick per authority publication, capped inside the callee.
    // While waiting for the conversation to mount, the same notification
    // retries CONTAINER DISCOVERY only. No timer, no observer, no second scroll.
    try {
      if (chatAtlasRevealState.transactionState === 'waiting-for-container-readiness') {
        chatAtlasRevealRunOneShot(chatAtlasRevealState.readinessTarget);
      } else {
        chatAtlasRevealReconcileTick();
      }
    } catch {}
    const detail = getCompleteTurnIndexProjectionStatus();
    try { W.dispatchEvent(new CustomEvent(COMPLETE_TURN_INDEX_STATE_EVENT, { detail })); } catch {}
    try { H2O.events?.emit?.(COMPLETE_TURN_INDEX_STATE_EVENT, detail); } catch {}
    try {
      const api = W.H2O_MM_CORE_API || W.top?.H2O_MM_CORE_API || null;
      api?.scheduleRebuild?.(`complete-index:${detail.status}`);
    } catch {}
    return detail;
  }

  function chatAtlasIndexIsStrictPrefixOf(incoming, complete) {
    const prefix = Array.isArray(incoming?.turns) ? incoming.turns : [];
    const full = Array.isArray(complete?.turns) ? complete.turns : [];
    if (!prefix.length || prefix.length >= full.length) return false;
    return prefix.every((turn, index) => {
      const expected = full[index];
      return Number(turn?.order || 0) === index + 1
        && turn?.qId === expected?.qId
        && turn?.primaryAId === expected?.primaryAId
        && turn?.noAnswer === expected?.noAnswer
        && turn?.stopped === expected?.stopped
        && JSON.stringify(turn?.answerVariants || [])
          === JSON.stringify(expected?.answerVariants || []);
    });
  }

  // ── Downstream native parity (Stage 2C-2aj2) ─────────────────────────────
  // The manual anchor is the user's deliberate change and is exempt. Every
  // fork BELOW it must match the host's own selection: the derivation is free
  // to pick a valid sibling continuation, and publishing that sibling is how
  // a 39-turn overlay came to be shown while native was still on a 36-turn
  // chain. Parity is proven by identity (qId + primaryAId) against the host
  // current_node chain, reusing chatAtlasChainToRoot and
  // chatAtlasTurnsFromChain — no second traversal model.
  //
  // No newest-created, longest-path, first/last-answer or DOM-order
  // tie-breaker is consulted here: below the anchor the host chain is the
  // only authority, and an unprovable comparison fails closed.
  function chatAtlasDownstreamNativeParity(derivedPath, anchorQId, targetAnswerId, graph, byId, clientChain = null) {
    const fail = (reason) => Object.freeze({ ok: false, reason, comparedTurns: 0 });
    const path = Array.isArray(derivedPath) ? derivedPath : [];
    const anchor = chatAtlasCompleteIndexIdentity(anchorQId);
    if (!path.length || !anchor) return fail('downstream-parity-scope-unavailable');
    const anchorIndex = path.findIndex(
      (turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === anchor,
    );
    if (anchorIndex < 0) return fail('downstream-parity-anchor-missing');
    // Nothing below the anchor: the manual change is the tail, so there is no
    // downstream fork to disagree about.
    if (anchorIndex === path.length - 1) {
      return Object.freeze({ ok: true, reason: null, comparedTurns: 0 });
    }
    // A proven client selected chain is the manual-session reference: it is
    // the only source that follows a native switch immediately. current_node
    // remains the reference for everything else.
    const clientProven = clientChain && clientChain.ok === true
      && Array.isArray(clientChain.nodes) && clientChain.nodes.length;
    let hostChain = null;
    if (clientProven) {
      // clientChain.nodes carries product message nodes only. Pairing needs the
      // complete structural root-to-leaf chain -- tool, system and shell nodes
      // included -- which is exactly what the fallback branch below builds, so
      // build it the same way from the client chain's own terminal.
      const terminal = clientChain.nodes[clientChain.nodes.length - 1];
      try { hostChain = chatAtlasChainToRoot(byId, terminal); } catch { hostChain = null; }
    } else {
      const currentNode = byId.get(chatAtlasCompleteIndexIdentity(graph?.currentNode));
      if (!currentNode) return fail('downstream-parity-current-node-unresolved');
      try { hostChain = chatAtlasChainToRoot(byId, currentNode); } catch { hostChain = null; }
    }
    if (!hostChain) return fail('downstream-parity-host-chain-unresolved');
    const hostTurns = chatAtlasTurnsFromChain(hostChain, byId);
    if (!hostTurns) return fail('downstream-parity-host-path-invalid');
    // POST-CLICK PROOF. A retained graph captured BEFORE the click still has
    // current_node on the outgoing branch, so it carries no host selection
    // below the new anchor to compare against. Requiring the anchor's newly
    // selected answer to be present on this very chain is what proves the
    // capture is already current. Without it the retained graph is simply not
    // authority for a manual publication yet.
    const target = chatAtlasCompleteIndexIdentity(targetAnswerId);
    const hostAnchor = hostTurns.find(
      (turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === anchor,
    ) || null;
    if (!hostAnchor) return fail('retained-graph-pre-click');
    if (target) {
      const hostAnchorAnswer = chatAtlasCompleteIndexIdentity(hostAnchor.primaryAId);
      const hostAnchorVariants = (hostAnchor.answerVariants || [])
        .map((id) => chatAtlasCompleteIndexIdentity(id));
      if (hostAnchorAnswer !== target && !hostAnchorVariants.includes(target)) {
        return fail('retained-graph-pre-click');
      }
    }
    const hostByQId = new Map(hostTurns.map(
      (turn) => [chatAtlasCompleteIndexIdentity(turn?.qId), turn],
    ));
    let compared = 0;
    for (let index = anchorIndex + 1; index < path.length; index += 1) {
      const turn = path[index];
      const qId = chatAtlasCompleteIndexIdentity(turn?.qId);
      const hostTurn = qId ? hostByQId.get(qId) : null;
      // A question the host never selected: the derivation took a different
      // question-edit fork below the anchor.
      if (!hostTurn) return fail('downstream-question-fork-differs');
      if (
        chatAtlasCompleteIndexIdentity(turn?.primaryAId)
        !== chatAtlasCompleteIndexIdentity(hostTurn?.primaryAId)
      ) return fail('downstream-answer-fork-differs');
      compared += 1;
    }
    return Object.freeze({ ok: true, reason: null, comparedTurns: compared });
  }

  function chatAtlasBranchTransactionPublicationDecision(envelope, source) {
    const transaction = chatAtlasBranchTransactionCurrent();
    const incomingCount = Array.isArray(envelope?.turns) ? envelope.turns.length : 0;
    const incomingFingerprint = String(envelope?.sourceFingerprint || '');
    if (transaction?.state === 'fail-closed') {
      selectedPathAcquisitionState.lastPublicationDecision = chatAtlasFreeze({
        source: String(source || ''),
        incomingCount,
        incomingFingerprint: incomingFingerprint || null,
        published: false,
        reason: 'branch-transaction-fail-closed',
      });
      return Object.freeze({
        handled: true,
        published: false,
        reason: 'branch-transaction-fail-closed',
      });
    }
    if (transaction?.state !== 'pending') return Object.freeze({ handled: false });
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    const retained = selectedPathAcquisitionState.graph;
    const route = chatAtlasFullIndexRoute();
    const scopeCurrent = !!intent
      && transaction.token === String(intent.token || '')
      && transaction.qId === String(intent.qId || '')
      && transaction.chatId === String(intent.chatId || '')
      && transaction.routeKey === String(intent.routeKey || '')
      && transaction.generation === Number(intent.generation || 0)
      && transaction.staleRevision === Number(intent.staleRevision || 0)
      && intent.chatId === String(completeTurnIndexAuthorityState.chatId || '')
      && intent.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
      && Number(intent.generation || 0) === Number(completeTurnIndexAuthorityState.generation || 0)
      && intent.chatId === String(route?.chatId || '')
      && intent.routeKey === String(route?.routeKey || '')
      && completeTurnIndexAuthorityState.branchSelectionStale === true
      && Number(intent.staleRevision || 0)
        === Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0);
    const remember = (decision) => {
      selectedPathAcquisitionState.lastPublicationDecision = chatAtlasFreeze({
        source: String(source || ''),
        incomingCount,
        incomingFingerprint: incomingFingerprint || null,
        ...decision,
      });
      return Object.freeze({ handled: true, ...decision });
    };
    // A decision that stays PENDING for more evidence has not evaluated this
    // graph to a conclusion, so it must not leave a completed-evaluation record
    // behind: chatAtlasScheduleCompleteIndexRefresh would then treat the
    // retained pre-click graph as already evaluated and skip the one bounded
    // refresh this trusted token owns — starving the selection exactly as the
    // live defect did. Whatever the acquisition lane recorded is restored
    // untouched.
    const priorGraphCaptureIdentity = String(transaction.graphCaptureIdentity || '');
    const priorGraphEvaluationKey = String(transaction.graphEvaluationKey || '');
    const holdPending = (reason) => {
      transaction.graphCaptureIdentity = priorGraphCaptureIdentity;
      transaction.graphEvaluationKey = priorGraphEvaluationKey;
      return remember({ published: false, reason });
    };
    if (!scopeCurrent) {
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        'branch-transaction-scope-invalid',
        String(transaction.token || ''),
      );
      return remember({ published: false, reason: 'branch-transaction-scope-invalid' });
    }
    const graphScopeCurrent = retained?.chatId === intent.chatId
      && retained?.routeKey === intent.routeKey
      && Number(retained?.generation || 0) === Number(intent.generation || 0)
      && chatAtlasIdentityGraphValid(retained?.identityGraph, intent.chatId);
    // ── Deferred native pager target resolution ──────────────────────────────
    // The trusted click retained qId, prior answer and direction; the exact
    // answer the pager moved to could not be proven at capture because no
    // trustworthy graph existed yet. THIS retained graph — the one already
    // being evaluated here, never unrelated global graph state — is that
    // evidence, and it resolves the target exactly once.
    const capturedCandidate = intent.returnTargetCandidate || null;
    const capturedTarget = chatAtlasCompleteIndexIdentity(
      capturedCandidate?.targetVariantAnswerId,
    );
    let activeCandidate = capturedCandidate;
    let resolvedDeferredTarget = '';
    if (
      !capturedTarget
      && graphScopeCurrent
      && chatAtlasReturnTargetCandidatePending(capturedCandidate)
    ) {
      const resolved = chatAtlasResolveNativeReturnTarget(
        retained.identityGraph,
        capturedCandidate.qId || intent.qId,
        capturedCandidate.priorAnswerId || intent.priorAnswerId,
        capturedCandidate.direction || intent.direction,
      );
      if (resolved.ok !== true) {
        // Trustworthy graph evidence now exists. Failure to establish a valid
        // unique neighbour is a genuine verdict, never another deferral.
        const reason = chatAtlasCompleteIndexCode(
          resolved.reason,
          'capture-candidate-invalid',
          64,
        );
        chatAtlasCloseBranchTransaction(
          'fail-closed',
          reason,
          String(transaction.token || ''),
        );
        return remember({ published: false, reason });
      }
      resolvedDeferredTarget = resolved.targetVariantAnswerId;
      activeCandidate = chatAtlasResolvedReturnTargetCandidate(
        capturedCandidate,
        resolvedDeferredTarget,
        retained,
      );
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({
        ...intent,
        returnTargetCandidate: activeCandidate,
      });
      chatAtlasBranchTransactionTrace('tx-return-target-resolved', {
        token: resolvedDeferredTarget,
      });
    }
    const targetAnswerId = chatAtlasCompleteIndexIdentity(
      capturedTarget
        || resolvedDeferredTarget
        || selectedPathAcquisitionState.anchorSelectedAId,
    );
    const graphCurrent = graphScopeCurrent && !!targetAnswerId;
    if (!graphCurrent) {
      // The ordinary refresh can finish before the one bounded graph
      // acquisition. Retain the previous complete authority and the exact
      // transaction owner; absence is temporary, never permission to publish
      // the host's current_node prefix and never an immediate terminal error.
      return holdPending('branch-transaction-graph-pending');
    }

    transaction.graphCaptureIdentity = String(retained.captureIdentity || '');
    transaction.graphEvaluationKey = JSON.stringify([
      transaction.token,
      transaction.graphCaptureIdentity,
      targetAnswerId,
    ]);

    const clientChain = chatAtlasNativeClientSelectedChain(retained.identityGraph, targetAnswerId);
    const clientProves = chatAtlasClientChainProvesAnchor(clientChain, targetAnswerId);
    const derived = chatAtlasDeriveSelectedPath(
      retained.identityGraph,
      Object.freeze({
        ...intent,
        mountedEvidence: new Map(),
        clientSelectedChainClosure: clientProves ? clientChain.closure : null,
        clientSelectedChain: clientProves ? clientChain : null,
      }),
      targetAnswerId,
    );
    if (!derived.ok || !chatAtlasSelectedPathProofValid(derived)) {
      const reason = derived.ok ? 'branch-transaction-proof-invalid' : derived.reason;
      // Same distinction as the acquisition path, enforced at the one site
      // that actually closes the transaction. A graph whose current_node chain
      // does not prove the newly selected anchor is pre-click evidence, so an
      // unresolved fork below that anchor is an artefact of the graph's age
      // rather than real ambiguity. Stay contained and pending exactly as the
      // downstream-parity gate below does, so the bounded refresh runs. A
      // graph that DOES prove the anchor still fails closed here.
      if (
        !derived.ok
        && !clientProves
        && chatAtlasSelectedPathStaleGraphEvidence(
          retained.identityGraph,
          targetAnswerId,
          reason,
        )
      ) {
        chatAtlasBranchTransactionTrace('tx-graph-pending', { reason });
        return holdPending('branch-transaction-graph-pending');
      }
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        reason,
        String(transaction.token || ''),
      );
      return remember({ published: false, reason });
    }
    const parity = chatAtlasDownstreamNativeParity(
      derived.path,
      intent.qId,
      targetAnswerId,
      retained.identityGraph,
      new Map((retained.identityGraph?.nodes || []).map((node) => [node.nodeId, node])),
      clientProves ? clientChain : null,
    );
    if (parity.ok !== true) {
      // Contained, NOT terminal: the transaction stays pending so the bounded
      // host refresh runs and the derivation is re-proven against a refreshed
      // current_node chain. 20/21 containment is preserved precisely because
      // the transaction remains open and nothing partial is published.
      selectedPathAcquisitionState.downstreamParityReason = parity.reason;
      return holdPending('branch-transaction-graph-pending');
    }
    selectedPathAcquisitionState.downstreamParityReason = null;
    const candidate = activeCandidate;
    const derivedMembers = chatAtlasBranchReturnPathMembers(derived.path);
    const derivedIdentity = chatAtlasBranchReturnPathIdentity(derivedMembers);
    // The frozen route is captured BEFORE any client-chain authority exists,
    // by the independent ranked derivation. When a unique validated client
    // chain has since proven the target and supplied the whole path, that
    // frozen pair describes a route the user is demonstrably not on, so it
    // must not veto the client-selected one. Protection is not lost: the
    // client path was already validated turn-by-turn against the chain inside
    // chatAtlasDeriveSelectedPath (exact length, per-turn qId and primaryAId,
    // exact terminal, no extra or omitted turns) and fails closed as
    // client-chain-path-mismatch. With no proven chain this guard is
    // unchanged, byte for byte.
    if (
      !clientProves
      && Number(candidate?.derivedTargetCount || 0) > 0
      && (
        Number(candidate.derivedTargetCount) !== derived.path.length
        || String(candidate.derivedPathIdentity || '') !== derivedIdentity
      )
    ) {
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        'branch-transaction-frozen-path-mismatch',
        String(transaction.token || ''),
      );
      return remember({ published: false, reason: 'branch-transaction-frozen-path-mismatch' });
    }

    selectedPathAcquisitionState.status = 'proven';
    selectedPathAcquisitionState.reason = 'selected-path-proven';
    selectedPathAcquisitionState.origin = 'manual-native-selection';
    selectedPathAcquisitionState.token = intent.token;
    selectedPathAcquisitionState.anchorQId = intent.qId;
    selectedPathAcquisitionState.anchorSelectedAId = targetAnswerId;
    selectedPathAcquisitionState.priorAnswerId = intent.priorAnswerId || null;
    selectedPathAcquisitionState.chatId = intent.chatId;
    selectedPathAcquisitionState.routeKey = intent.routeKey;
    selectedPathAcquisitionState.generation = intent.generation;
    selectedPathAcquisitionState.staleRevision = intent.staleRevision;
    selectedPathAcquisitionState.path = derived.path;
    selectedPathAcquisitionState.proof = derived.proof;
    selectedPathAcquisitionState.provenAt = new Date().toISOString();
    selectedPathAcquisitionState.evaluationKey = JSON.stringify([
      intent.token,
      completeTurnIndexAuthorityState.index?.sourceFingerprint || '',
      retained.captureIdentity,
      derivedIdentity,
    ]);
    chatAtlasSelectedPathOverlayEvaluate();
    const effective = getEffectivePresentationIndex();
    const expectedFingerprint = chatAtlasCompleteIndexFingerprint(derived.path);
    if (
      !chatAtlasSelectedPathOverlayCurrent()
      || !effective
      || effective.turns.length !== derived.path.length
      || String(effective.sourceFingerprint || '') !== expectedFingerprint
      || !chatAtlasTurnStateMatchesEffectiveIndex(effective)
    ) {
      chatAtlasCloseBranchTransaction(
        'fail-closed',
        'branch-transaction-atomic-publication-failed',
        String(transaction.token || ''),
      );
      return remember({ published: false, reason: 'branch-transaction-atomic-publication-failed' });
    }
    completeIndexRefreshCoordinator?.settleSelectedPathGraphPublication?.(transaction.token);
    return remember({
      published: true,
      reason: 'complete-graph-path-published',
      acceptedCount: effective.turns.length,
      acceptedFingerprint: String(effective.sourceFingerprint || ''),
      tailNodeId: String(derived.proof?.tailNodeId || '') || null,
    });
  }

  function chatAtlasTryPublishRetainedBranchTransaction(source = 'retained-graph-acquisition') {
    const transaction = chatAtlasBranchTransactionCurrent();
    if (transaction?.state !== 'pending') return Object.freeze({ handled: false });
    const index = completeTurnIndexAuthorityState.index;
    if (!index?.turns?.length) return Object.freeze({ handled: false });
    return chatAtlasBranchTransactionPublicationDecision(index, source);
  }

  function chatAtlasPublishCompleteIndex(envelope, source) {
    const transactionDecision = chatAtlasBranchTransactionPublicationDecision(envelope, source);
    if (transactionDecision.handled) return chatAtlasNotifyCompleteIndexState();
    const effective = getEffectivePresentationIndex();
    if (
      chatAtlasSelectedPathOverlayCurrent()
      && chatAtlasIndexIsStrictPrefixOf(envelope, effective)
    ) {
      selectedPathAcquisitionState.lastPublicationDecision = chatAtlasFreeze({
        source: String(source || ''),
        incomingCount: Array.isArray(envelope?.turns) ? envelope.turns.length : 0,
        incomingFingerprint: String(envelope?.sourceFingerprint || '') || null,
        published: false,
        reason: 'host-current-node-prefix-rejected',
        acceptedCount: effective.turns.length,
        acceptedFingerprint: String(effective.sourceFingerprint || ''),
      });
      return chatAtlasNotifyCompleteIndexState();
    }
    const priorSelectedPathFingerprint = (
      typeof selectedPathAcquisitionState !== 'undefined'
      && selectedPathAcquisitionState.status === 'proven'
    )
      ? String(selectedPathAcquisitionState.proof?.canonicalFingerprint || '')
      : '';
    const priorOverlayFingerprint = (
      typeof selectedPathOverlayState !== 'undefined'
      && selectedPathOverlayState.status === 'active'
    )
      ? String(selectedPathOverlayState.canonicalFingerprint || '')
      : '';
    if (
      priorOverlayFingerprint
      && priorOverlayFingerprint !== String(envelope?.sourceFingerprint || '')
      && typeof chatAtlasClearSelectedPathOverlay === 'function'
    ) {
      chatAtlasClearSelectedPathOverlay('canonical-fingerprint-changed');
    }
    completeTurnIndexAuthorityState.index = envelope;
    completeTurnIndexAuthorityState.indexSource = source;
    buildTurns();
    if (
      priorSelectedPathFingerprint
      && priorSelectedPathFingerprint !== String(envelope?.sourceFingerprint || '')
      && typeof chatAtlasClearSelectedPathAcquisition === 'function'
    ) {
      chatAtlasClearSelectedPathAcquisition(
        'canonical-fingerprint-changed',
        { preserveGraph: true },
      );
      if (typeof chatAtlasSelectedPathEvaluate === 'function') {
        chatAtlasSelectedPathEvaluate(chatAtlasLedgerState.members);
      }
    }
    return chatAtlasNotifyCompleteIndexState();
  }

  completeIndexRefreshCoordinator = createCompleteIndexRefreshCoordinator({
    isEnabled: () => chatAtlasCompleteIndexAuthorityActive(),
    routeKey: () => `${completeTurnIndexAuthorityState.chatId || ''}|${completeTurnIndexAuthorityState.routeKey || ''}`,
    chatId: () => completeTurnIndexAuthorityState.chatId,
    currentIndex: () => completeTurnIndexAuthorityState.index,
    pendingCount: () => completeTurnIndexAuthorityState.pendingDrafts.size,
    provider: () => {
      const provider = H2O.archiveBoot?.fetchConversationTurnIndex;
      if (typeof provider !== 'function') return null;
      return (chatId, opts) => {
        completeTurnIndexAuthorityState.fetchCount += 1;
        const context = Object.freeze({
          chatId: String(completeTurnIndexAuthorityState.chatId || ''),
          routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
          generation: Number(completeTurnIndexAuthorityState.generation || 0),
        });
        return Promise.resolve(provider(chatId, {
          ...(opts || {}),
          includeIdentityGraph: true,
        })).then((result) => {
          const scopeCurrent = context.chatId === String(completeTurnIndexAuthorityState.chatId || '')
            && context.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
            && context.generation === Number(completeTurnIndexAuthorityState.generation || 0);
          if (scopeCurrent) {
            const retainedCurrentGraph = chatAtlasRetainIdentityGraph(result, context);
            if (retainedCurrentGraph) {
              chatAtlasTryPublishRetainedBranchTransaction('coordinator-graph-acquisition');
            }
          }
          return result;
        });
      };
    },
    normalize: (raw, chatId) => chatAtlasNormalizeCompleteIndexEnvelope(raw, chatId, { source: 'host' }),
    compareRevision: chatAtlasCompareCompleteIndexRevision,
    selectedPathConfirmed: chatAtlasCompleteIndexSelectedPathConfirmed,
    selectedPathEvidenceCurrent: chatAtlasCompleteIndexSelectedPathEvidenceCurrent,
    selectedPathLeaseCurrent: chatAtlasCompleteIndexSelectedPathLeaseCurrent,
    selectedPathRequestScope: (evidence) => {
      const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      if (
        !intent
        || !evidence?.selectionToken
        || evidence.selectionToken !== intent.token
        || evidence.qId !== intent.qId
      ) return null;
      return Object.freeze({
        requestIdentity: String(evidence.signature || ''),
        token: intent.token,
        chatId: intent.chatId,
        routeKey: intent.routeKey,
        generation: intent.generation,
        staleRevision: intent.staleRevision,
        qId: intent.qId,
      });
    },
    routeGeneration: () => Number(completeTurnIndexAuthorityState.generation || 0),
    reconciliationActive: () => completeTurnIndexAuthorityState.autoBranchReconciliationEnabled === true,
    onSelectedPathResolved: chatAtlasResolveTrustedNativeBranchSelection,
    trace: chatAtlasTraceTrustedLifecycle,
    writeCache: (envelope) => {
      const transaction = chatAtlasBranchTransactionCurrent();
      const effective = getEffectivePresentationIndex();
      const prefixOfCurrentOverlay = chatAtlasSelectedPathOverlayCurrent()
        && chatAtlasIndexIsStrictPrefixOf(envelope, effective);
      if (
        transaction?.state === 'pending'
        || transaction?.state === 'fail-closed'
        || prefixOfCurrentOverlay
      ) {
        completeTurnIndexAuthorityState.cacheWriteSkippedUnchangedCount += 1;
        return {
          ok: true,
          status: transaction?.state === 'pending' || transaction?.state === 'fail-closed'
            ? 'cache-write-deferred-branch-transaction'
            : 'cache-write-rejected-host-prefix',
          bytes: null,
          skipped: true,
        };
      }
      const result = chatAtlasWriteCompleteIndexCache(envelope);
      if (result.ok) completeTurnIndexAuthorityState.cacheRaw = result.bytes;
      return result;
    },
    publish: chatAtlasPublishCompleteIndex,
    onState: (detail) => {
      completeTurnIndexAuthorityState.status = String(detail?.status || completeTurnIndexAuthorityState.status);
      completeTurnIndexAuthorityState.startedAt = detail?.startedAt || completeTurnIndexAuthorityState.startedAt;
      completeTurnIndexAuthorityState.completedAt = detail?.completedAt || null;
      completeTurnIndexAuthorityState.errorCode = detail?.errorCode || null;
      completeTurnIndexAuthorityState.authorityUnpersisted = detail?.authorityUnpersisted === true;
      completeTurnIndexAuthorityState.cacheWriteErrorCode = detail?.cacheWriteErrorCode || null;
      chatAtlasNotifyCompleteIndexState();
    },
    setTimeout: W.setTimeout.bind(W),
    clearTimeout: W.clearTimeout.bind(W),
    AbortController: W.AbortController,
  });

  function chatAtlasResetCompleteIndexRoute(nextRoute, staleStatus = false, options = {}) {
    const clearedIntent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    completeTurnIndexAuthorityState.nativeConvergenceState = null;
    chatAtlasCloseBranchTransaction('reset', staleStatus ? 'route-changed' : 'authority-reset');
    chatAtlasResetBranchExpansionLifecycle(staleStatus ? 'route-changed' : 'authority-reset');
    if (typeof chatAtlasClearSelectedPathOverlay === 'function') {
      chatAtlasClearSelectedPathOverlay(
        staleStatus ? 'route-changed' : 'authority-reset',
      );
    }
    if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
      chatAtlasClearSelectedPathAcquisition(
        staleStatus ? 'route-changed' : 'authority-reset',
        { resetRefetchGuard: true },
      );
    }
    const preserveBranchSelectionStale = options?.preserveBranchSelectionStale === true
      && completeTurnIndexAuthorityState.branchSelectionStale === true
      && String(nextRoute?.chatId || '') === String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '')
      && String(nextRoute?.routeKey || '') === String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '');
    if (!preserveBranchSelectionStale) {
      chatAtlasClearBranchSelectionStale(null, staleStatus ? 'route-changed' : 'authority-reset', false);
    }
    chatAtlasCancelTrustedNativeBranchReconcile();
    // Lifecycle reset: the memory-only automatic-reconciliation qualification
    // gate must NOT survive an enable/disable transition, a preference clear, or
    // a route/chat generation boundary — all of which funnel through here (from
    // chatAtlasApplyCompleteIndexProjectionEnabled and chatAtlasTriggerCompleteIndexAuthority).
    // It returns to false so re-enabling the projection can never silently
    // reactivate reconciliation; a qualification test must explicitly re-enable
    // it after any lifecycle boundary. Nothing is persisted.
    if (completeTurnIndexAuthorityState.autoBranchReconciliationEnabled === true) {
      completeTurnIndexAuthorityState.autoBranchReconciliationEnabled = false;
      chatAtlasTraceTrustedLifecycle('auto-branch-reconciliation-reset', {
        reason: staleStatus ? 'route-reset-route-changed' : 'authority-reset',
        chat: nextRoute?.chatId || '',
      });
    }
    completeIndexRefreshCoordinator?.cancel?.(
      staleStatus ? 'route-changed' : 'authority-reset',
      staleStatus ? 'stale-route-discarded' : 'idle',
    );
    try { completeTurnIndexAuthorityState.controller?.abort?.('route-changed'); } catch {}
    completeTurnIndexAuthorityState.generation += 1;
    try { chatAtlasResetManualBranchOverride('route-generation-reset'); } catch {}
    completeTurnIndexAuthorityState.status = completeTurnIndexAuthorityState.enabled
      ? (staleStatus ? 'stale-route-discarded' : 'loading-full-index')
      : 'disabled';
    completeTurnIndexAuthorityState.chatId = nextRoute?.chatId || null;
    completeTurnIndexAuthorityState.routeKey = nextRoute?.routeKey || '';
    completeTurnIndexAuthorityState.fetchCount = 0;
    completeTurnIndexAuthorityState.startedAt = null;
    completeTurnIndexAuthorityState.completedAt = staleStatus ? new Date().toISOString() : null;
    completeTurnIndexAuthorityState.errorCode = null;
    completeTurnIndexAuthorityState.authorityUnpersisted = false;
    completeTurnIndexAuthorityState.cacheWriteErrorCode = null;
    completeTurnIndexAuthorityState.diagnosticStatus = null;
    completeTurnIndexAuthorityState.index = null;
    completeTurnIndexAuthorityState.indexSource = null;
    completeTurnIndexAuthorityState.cacheChecked = false;
    completeTurnIndexAuthorityState.cacheRaw = null;
    completeTurnIndexAuthorityState.attempted = false;
    completeTurnIndexAuthorityState.promise = null;
    completeTurnIndexAuthorityState.controller = null;
    completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
    if (preserveBranchSelectionStale) {
      completeTurnIndexAuthorityState.branchSelectionStaleGeneration = completeTurnIndexAuthorityState.generation;
    }
    if (clearedIntent) {
      chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
        reason: staleStatus ? 'route-reset-route-changed' : 'route-reset-authority-reset',
        qId: clearedIntent.qId,
        token: clearedIntent.token,
        chat: nextRoute?.chatId || '',
      });
    }
    completeTurnIndexAuthorityState.pendingDrafts.clear();
    completeTurnIndexAuthorityState.pendingObservedAt.clear();
    completeTurnIndexAuthorityState.pendingStateNotifyQueued = false;
  }

  function chatAtlasTriggerCompleteIndexAuthority() {
    const route = chatAtlasFullIndexRoute();
    const routeChanged = route.routeKey !== completeTurnIndexAuthorityState.routeKey
      || route.chatId !== completeTurnIndexAuthorityState.chatId;
    if (routeChanged) {
      const stale = completeTurnIndexAuthorityState.status === 'loading-full-index'
        && !!completeTurnIndexAuthorityState.promise;
      if (stale) completeTurnIndexAuthorityState.staleDiscardCount += 1;
      chatAtlasResetCompleteIndexRoute(route, stale && !route.chatId);
    }
    if (!route.chatId) {
      if (routeChanged) chatAtlasNotifyCompleteIndexState();
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }

    if (!completeTurnIndexAuthorityState.cacheChecked) {
      completeTurnIndexAuthorityState.cacheChecked = true;
      const cached = chatAtlasReadCompleteIndexCache(route.chatId);
      completeTurnIndexAuthorityState.cacheRaw = cached.raw;
      if (cached.ok) {
        completeTurnIndexAuthorityState.status = 'complete-from-cache';
        completeTurnIndexAuthorityState.errorCode = null;
        chatAtlasPublishCompleteIndex(cached.envelope, 'cache');
      } else {
        completeTurnIndexAuthorityState.status = 'loading-full-index';
        completeTurnIndexAuthorityState.errorCode = cached.status === 'cache-missing' ? null : cached.status;
        chatAtlasNotifyCompleteIndexState();
      }
    }
    if (completeTurnIndexAuthorityState.promise) return completeTurnIndexAuthorityState.promise;
    if (completeTurnIndexAuthorityState.attempted) {
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const provider = H2O.archiveBoot?.fetchConversationTurnIndex;
    if (typeof provider !== 'function') return Promise.resolve(getCompleteTurnIndexProjectionStatus());

    const Controller = W.AbortController;
    const controller = typeof Controller === 'function' ? new Controller() : null;
    const generation = completeTurnIndexAuthorityState.generation;
    const routeKey = route.routeKey;
    const cachedIndex = completeTurnIndexAuthorityState.index;
    completeTurnIndexAuthorityState.attempted = true;
    completeTurnIndexAuthorityState.fetchCount += 1;
    completeTurnIndexAuthorityState.startedAt = new Date().toISOString();
    completeTurnIndexAuthorityState.completedAt = null;
    completeTurnIndexAuthorityState.controller = controller;
    const operation = Promise.resolve()
      .then(() => provider(route.chatId, {
        signal: controller?.signal,
        includeIdentityGraph: true,
      }))
      .then((result) => {
        const stillCurrent = generation === completeTurnIndexAuthorityState.generation
          && routeKey === completeTurnIndexAuthorityState.routeKey
          && route.chatId === completeTurnIndexAuthorityState.chatId;
        if (!stillCurrent) {
          completeTurnIndexAuthorityState.staleDiscardCount += 1;
          return getCompleteTurnIndexProjectionStatus();
        }
        chatAtlasRetainIdentityGraph(result, {
          chatId: route.chatId,
          routeKey,
          generation,
        });
        completeTurnIndexAuthorityState.completedAt = new Date().toISOString();
        const normalized = result?.ok === true
          ? chatAtlasNormalizeCompleteIndexEnvelope(result.index, route.chatId, { source: 'host' })
          : { ok: false, errorCode: String(result?.errorCode || 'full-index-unavailable') };
        if (!normalized.ok) {
          completeTurnIndexAuthorityState.status = cachedIndex
            ? 'offline-complete-cache'
            : 'full-index-unavailable';
          completeTurnIndexAuthorityState.diagnosticStatus = !cachedIndex && turnState.turns.length
            ? 'partial-fallback-diagnostic-only'
            : null;
          completeTurnIndexAuthorityState.errorCode = chatAtlasCompleteIndexCode(normalized.errorCode, 'full-index-unavailable');
          chatAtlasNotifyCompleteIndexState();
          return getCompleteTurnIndexProjectionStatus();
        }

        const hostIndex = normalized.envelope;
        const sameFingerprint = !!cachedIndex
          && cachedIndex.sourceFingerprint === hostIndex.sourceFingerprint;
        const revisionOrder = cachedIndex
          ? chatAtlasCompareCompleteIndexRevision(hostIndex.payloadUpdateTime, cachedIndex.payloadUpdateTime)
          : 1;
        if (sameFingerprint) {
          if (revisionOrder >= 0) {
            const write = chatAtlasWriteCompleteIndexCache(hostIndex);
            completeTurnIndexAuthorityState.authorityUnpersisted = !write.ok;
            completeTurnIndexAuthorityState.cacheWriteErrorCode = write.ok
              ? null
              : chatAtlasCompleteIndexCode(write.status, 'cache-write-failed');
            if (!write.ok) completeTurnIndexAuthorityState.errorCode = completeTurnIndexAuthorityState.cacheWriteErrorCode;
            completeTurnIndexAuthorityState.index = hostIndex;
            completeTurnIndexAuthorityState.indexSource = write.ok ? 'host-payload' : 'host-payload-unpersisted';
          }
          completeTurnIndexAuthorityState.status = 'complete-validated';
          if (!completeTurnIndexAuthorityState.errorCode) completeTurnIndexAuthorityState.errorCode = null;
          buildTurns();
          chatAtlasNotifyCompleteIndexState();
          return getCompleteTurnIndexProjectionStatus();
        }
        if (cachedIndex && revisionOrder < 0) {
          completeTurnIndexAuthorityState.status = 'complete-from-cache';
          completeTurnIndexAuthorityState.errorCode = 'older-host-payload';
          chatAtlasNotifyCompleteIndexState();
          return getCompleteTurnIndexProjectionStatus();
        }

        const write = chatAtlasWriteCompleteIndexCache(hostIndex);
        completeTurnIndexAuthorityState.status = 'complete-from-host-payload';
        completeTurnIndexAuthorityState.errorCode = write.ok
          ? null
          : chatAtlasCompleteIndexCode(write.status, 'cache-write-failed');
        completeTurnIndexAuthorityState.authorityUnpersisted = !write.ok;
        completeTurnIndexAuthorityState.cacheWriteErrorCode = write.ok
          ? null
          : completeTurnIndexAuthorityState.errorCode;
        chatAtlasPublishCompleteIndex(hostIndex, write.ok ? 'host-payload' : 'host-payload-unpersisted');
        return getCompleteTurnIndexProjectionStatus();
      })
      .catch((error) => {
        if (generation === completeTurnIndexAuthorityState.generation && routeKey === completeTurnIndexAuthorityState.routeKey) {
          completeTurnIndexAuthorityState.status = cachedIndex
            ? 'offline-complete-cache'
            : 'full-index-unavailable';
          completeTurnIndexAuthorityState.diagnosticStatus = !cachedIndex && turnState.turns.length
            ? 'partial-fallback-diagnostic-only'
            : null;
          completeTurnIndexAuthorityState.completedAt = new Date().toISOString();
          completeTurnIndexAuthorityState.errorCode = chatAtlasCompleteIndexCode(error?.code, 'provider-failed');
          chatAtlasNotifyCompleteIndexState();
        }
        return getCompleteTurnIndexProjectionStatus();
      })
      .finally(() => {
        if (generation === completeTurnIndexAuthorityState.generation && routeKey === completeTurnIndexAuthorityState.routeKey) {
          completeTurnIndexAuthorityState.promise = null;
          completeTurnIndexAuthorityState.controller = null;
        }
      });
    completeTurnIndexAuthorityState.promise = operation;
    return operation;
  }

  function chatAtlasApplyCompleteIndexProjectionEnabled(value, source = 'memory-canary') {
    const enabled = value === true;
    completeTurnIndexAuthorityState.activationSource = chatAtlasCompleteIndexCode(source, 'memory-canary', 48);
    if (enabled === completeTurnIndexAuthorityState.enabled) {
      return chatAtlasFreeze({ ok: true, changed: false, ...getCompleteTurnIndexProjectionStatus() });
    }
    completeTurnIndexAuthorityState.enabled = enabled;
    chatAtlasResetCompleteIndexRoute(chatAtlasFullIndexRoute(), false);
    if (enabled) {
      void chatAtlasTriggerCompleteIndexAuthority();
    } else {
      buildTurns();
      chatAtlasNotifyCompleteIndexState();
    }
    return chatAtlasFreeze({ ok: true, changed: true, ...getCompleteTurnIndexProjectionStatus() });
  }

  function setCompleteTurnIndexProjectionCanary(value) {
    completeTurnIndexAuthorityState.setterCallCount += 1;
    return chatAtlasApplyCompleteIndexProjectionEnabled(value === true, 'memory-canary');
  }

  // Memory-only qualification control for the DEFERRED automatic native
  // response-branch reconciliation (Round 2). It writes no localStorage and is
  // never a normal product setting: it exists only so focused validators (and
  // manual Gate 5 qualification) can exercise the accepted reconciliation
  // implementation without enabling it during normal Round 1 operation. Default
  // is false; boot/reload re-initialise it to false; it is independent of the
  // complete-turn projection preference and of the projection canary.
  function setCompleteTurnIndexAutoBranchReconciliationCanary(value) {
    completeTurnIndexAuthorityState.autoBranchReconciliationSetterCallCount += 1;
    const enabled = value === true;
    const disabling = completeTurnIndexAuthorityState.autoBranchReconciliationEnabled === true && !enabled;
    completeTurnIndexAuthorityState.autoBranchReconciliationEnabled = enabled;
    if (disabling) {
      // Cause-scoped rollback: revoke only selected-path reconciliation. Initial
      // authority, explicit/manual refresh, streaming, and turn-settled work keep
      // their coordinator state. An already-running selected-only GET is allowed
      // to settle but its result is discarded by the execution guard.
      chatAtlasCancelTrustedNativeBranchReconcile();
      chatAtlasResetBranchExpansionLifecycle('reconciliation-disabled-by-setter');
      completeIndexRefreshCoordinator?.cancelSelectedPathReconciliation?.('reconciliation-disabled-by-setter');
      const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
      if (intent) {
        completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
        if (typeof chatAtlasClearSelectedPathAcquisition === 'function') {
          chatAtlasClearSelectedPathAcquisition(
            'reconciliation-disabled-by-setter',
            { preserveGraph: true },
          );
        }
        chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
          reason: 'reconciliation-disabled-by-setter',
          qId: intent.qId,
          token: intent.token,
        });
      }
    }
    return getCompleteTurnIndexProjectionStatus();
  }

  function chatAtlasResolveCompleteIndexProjectionPreference() {
    if (completeTurnIndexAuthorityState.preferenceResolved) {
      return {
        enabled: completeTurnIndexAuthorityState.preferenceResolution === 'stored-enabled',
        resolution: completeTurnIndexAuthorityState.preferenceResolution,
      };
    }
    completeTurnIndexAuthorityState.preferenceResolved = true;
    completeTurnIndexAuthorityState.preferenceReadCount += 1;
    completeTurnIndexAuthorityState.preferenceReadErrorCode = null;
    let raw = null;
    try {
      raw = W.localStorage?.getItem?.(COMPLETE_TURN_INDEX_PREFERENCE_KEY) ?? null;
    } catch {
      completeTurnIndexAuthorityState.preferenceStoredValue = null;
      completeTurnIndexAuthorityState.preferenceResolution = 'read-failed-disabled';
      completeTurnIndexAuthorityState.preferenceReadErrorCode = 'preference-read-failed';
      return { enabled: false, resolution: 'read-failed-disabled' };
    }
    if (raw === '1') {
      completeTurnIndexAuthorityState.preferenceStoredValue = '1';
      completeTurnIndexAuthorityState.preferenceResolution = 'stored-enabled';
      return { enabled: true, resolution: 'stored-enabled' };
    }
    if (raw === '0') {
      completeTurnIndexAuthorityState.preferenceStoredValue = '0';
      completeTurnIndexAuthorityState.preferenceResolution = 'stored-disabled';
      return { enabled: false, resolution: 'stored-disabled' };
    }
    completeTurnIndexAuthorityState.preferenceStoredValue = raw == null ? null : 'invalid';
    completeTurnIndexAuthorityState.preferenceResolution = raw == null
      ? 'compiled-default-disabled'
      : 'malformed-disabled';
    return { enabled: COMPLETE_TURN_INDEX_COMPILED_DEFAULT, resolution: completeTurnIndexAuthorityState.preferenceResolution };
  }

  function chatAtlasApplyCompleteIndexProjectionPreferenceAtBoot() {
    const resolved = chatAtlasResolveCompleteIndexProjectionPreference();
    completeTurnIndexAuthorityState.bootApplyCount += 1;
    if (resolved.enabled) completeTurnIndexAuthorityState.bootActivationCount += 1;
    return chatAtlasApplyCompleteIndexProjectionEnabled(
      resolved.enabled === true,
      resolved.enabled
        ? 'persisted-preference-boot'
        : (resolved.resolution === 'stored-disabled' ? 'persisted-preference-boot-disabled' : 'compiled-default-boot'),
    );
  }

  function getCompleteTurnIndexProjectionPreference() {
    if (!completeTurnIndexAuthorityState.preferenceResolved) chatAtlasResolveCompleteIndexProjectionPreference();
    return chatAtlasFreeze({
      key: COMPLETE_TURN_INDEX_PREFERENCE_KEY,
      compiledDefault: COMPLETE_TURN_INDEX_COMPILED_DEFAULT,
      storedValue: completeTurnIndexAuthorityState.preferenceStoredValue,
      resolution: completeTurnIndexAuthorityState.preferenceResolution,
      activationSource: completeTurnIndexAuthorityState.activationSource,
      readCount: completeTurnIndexAuthorityState.preferenceReadCount,
      writeCount: completeTurnIndexAuthorityState.preferenceWriteCount,
      clearCount: completeTurnIndexAuthorityState.preferenceClearCount,
      bootApplyCount: completeTurnIndexAuthorityState.bootApplyCount,
      bootActivationCount: completeTurnIndexAuthorityState.bootActivationCount,
      readErrorCode: completeTurnIndexAuthorityState.preferenceReadErrorCode,
      writeErrorCode: completeTurnIndexAuthorityState.preferenceWriteErrorCode,
    });
  }

  function setCompleteTurnIndexProjectionPreference(value) {
    completeTurnIndexAuthorityState.preferenceSetterCallCount += 1;
    const enabled = value === true || value === '1';
    const disabled = value === false || value === '0';
    if (!enabled && !disabled) {
      return chatAtlasFreeze({ ok: false, changed: false, errorCode: 'preference-value-invalid', ...getCompleteTurnIndexProjectionPreference() });
    }
    const storedValue = enabled ? '1' : '0';
    try {
      W.localStorage?.setItem?.(COMPLETE_TURN_INDEX_PREFERENCE_KEY, storedValue);
    } catch {
      completeTurnIndexAuthorityState.preferenceWriteFailureCount += 1;
      completeTurnIndexAuthorityState.preferenceWriteErrorCode = 'preference-write-failed';
      return chatAtlasFreeze({ ...getCompleteTurnIndexProjectionStatus(), ok: false, changed: false, errorCode: 'preference-write-failed' });
    }
    completeTurnIndexAuthorityState.preferenceWriteCount += 1;
    completeTurnIndexAuthorityState.preferenceWriteErrorCode = null;
    completeTurnIndexAuthorityState.preferenceResolved = true;
    completeTurnIndexAuthorityState.preferenceStoredValue = storedValue;
    completeTurnIndexAuthorityState.preferenceResolution = enabled ? 'stored-enabled' : 'stored-disabled';
    const applied = chatAtlasApplyCompleteIndexProjectionEnabled(enabled, 'persisted-preference-setter');
    return chatAtlasFreeze({ ok: true, persisted: true, storedValue, ...applied });
  }

  function clearCompleteTurnIndexProjectionPreference() {
    completeTurnIndexAuthorityState.preferenceSetterCallCount += 1;
    try {
      W.localStorage?.removeItem?.(COMPLETE_TURN_INDEX_PREFERENCE_KEY);
    } catch {
      completeTurnIndexAuthorityState.preferenceWriteFailureCount += 1;
      completeTurnIndexAuthorityState.preferenceWriteErrorCode = 'preference-clear-failed';
      return chatAtlasFreeze({ ...getCompleteTurnIndexProjectionStatus(), ok: false, changed: false, errorCode: 'preference-clear-failed' });
    }
    completeTurnIndexAuthorityState.preferenceClearCount += 1;
    completeTurnIndexAuthorityState.preferenceWriteErrorCode = null;
    completeTurnIndexAuthorityState.preferenceResolved = true;
    completeTurnIndexAuthorityState.preferenceStoredValue = null;
    completeTurnIndexAuthorityState.preferenceResolution = 'compiled-default-disabled';
    const applied = chatAtlasApplyCompleteIndexProjectionEnabled(COMPLETE_TURN_INDEX_COMPILED_DEFAULT, 'preference-cleared');
    return chatAtlasFreeze({ ok: true, cleared: true, ...applied });
  }

  function rebuildCompleteTurnIndexProjection() {
    if (!completeTurnIndexAuthorityState.enabled) {
      buildTurns();
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const route = chatAtlasFullIndexRoute();
    const expansionSnapshot = chatAtlasBranchExpansionRebuildSnapshot();
    chatAtlasResetCompleteIndexRoute(route, false, { preserveBranchSelectionStale: true });
    const staleCheckpoint = chatAtlasBranchSelectionStaleCheckpoint();
    return Promise.resolve(chatAtlasTriggerCompleteIndexAuthority()).then((result) => {
      if (staleCheckpoint && chatAtlasCompleteIndexExplicitRefreshSucceeded(result)) {
        let expansionHandled = false;
        const targetIndex = chatAtlasCanonicalPresentationIndex();
        if (
          expansionSnapshot
          && Array.isArray(targetIndex?.turns)
          && targetIndex.turns.length > Number(expansionSnapshot.priorEffectiveCount || 0)
        ) {
          const rebasedIntent = Object.freeze({
            ...expansionSnapshot,
            generation: Number(completeTurnIndexAuthorityState.generation || 0),
            staleRevision: Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0),
          });
          expansionHandled = !!chatAtlasOpenBranchExpansion(rebasedIntent, targetIndex);
          if (expansionHandled) {
            chatAtlasCompleteBranchExpansionCheckpoint('explicit-rebuild-complete', {
              allowConfirmation: true,
            });
          }
        }
        if (!expansionHandled) {
          chatAtlasClearBranchSelectionStale(staleCheckpoint, 'explicit-rebuild-complete');
        }
      }
      return result;
    });
  }

  function refreshCompleteTurnIndexProjection(cause = 'explicit-rebuild') {
    if (!completeTurnIndexAuthorityState.enabled) {
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const staleCheckpoint = chatAtlasBranchSelectionStaleCheckpoint();
    const refreshScope = Object.freeze({
      chatId: String(completeTurnIndexAuthorityState.chatId || ''),
      routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
    });
    const requestAlreadyActive = completeIndexRefreshCoordinator?.getStatus?.()?.requestActive === true;
    const runExplicitRefresh = () => chatAtlasScheduleCompleteIndexRefresh(
      String(cause || 'explicit-rebuild'),
      { immediate: true },
    );
    let operation = Promise.resolve(runExplicitRefresh());
    if (requestAlreadyActive) {
      // The in-flight request began before this explicit action and therefore
      // cannot honestly clear its stale checkpoint. Once it settles, replace
      // the coordinator's single queued trailing timer with one immediate,
      // route-scoped explicit validation and await that result instead.
      operation = operation.then(() => {
        const scopeCurrent = completeTurnIndexAuthorityState.enabled === true
          && refreshScope.chatId === String(completeTurnIndexAuthorityState.chatId || '')
          && refreshScope.routeKey === String(completeTurnIndexAuthorityState.routeKey || '')
          && refreshScope.generation === Number(completeTurnIndexAuthorityState.generation || 0);
        return scopeCurrent ? runExplicitRefresh() : getCompleteTurnIndexProjectionStatus();
      });
    }
    return operation.then((result) => {
      const refreshSucceeded = chatAtlasCompleteIndexExplicitRefreshSucceeded(result);
      const expansionHandled = refreshSucceeded && (
        chatAtlasCompleteBranchExpansionCheckpoint('explicit-refresh-complete', {
          allowConfirmation: true,
        })
        || chatAtlasRecheckFailedBranchExpansion('explicit-refresh-later-confirmation')
      );
      if (
        !expansionHandled
        &&
        staleCheckpoint
        && chatAtlasCompleteIndexExplicitRefreshSucceeded(result)
        && chatAtlasBranchSelectionStaleReconciled(staleCheckpoint)
      ) {
        chatAtlasClearBranchSelectionStale(staleCheckpoint, 'explicit-refresh-complete');
      }
      return result;
    });
  }

  const COMPLETE_TURN_INDEX_EVENT_CAUSES = Object.freeze({
    'question-branch-selected': 'question-branch-changed',
    'question-branch-switch': 'question-branch-changed',
    'selected-path-changed': 'question-selected-path-changed',
    'selected-path-switch': 'question-selected-path-changed',
    'edited-question-selected-path': 'question-selected-path-changed',
    'answer-branch-selected': 'answer-branch-changed',
    'turn-stopped': 'turn-stopped',
    'response-stopped': 'turn-stopped',
    'turn-settled': 'turn-settled',
    'stream-complete': 'turn-settled',
    'assistant-stream-complete': 'turn-settled',
  });

  function chatAtlasCompleteIndexTurnEventCause(detail) {
    const raw = String(
      detail?.completeIndexCause
      || detail?.cause
      || detail?.reason
      || detail?.kind
      || '',
    ).trim().toLowerCase();
    return COMPLETE_TURN_INDEX_EVENT_CAUSES[raw] || '';
  }

  function chatAtlasHandleCompleteIndexTurnEvent(detail = {}) {
    if (!completeTurnIndexAuthorityState.enabled) {
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    const cause = chatAtlasCompleteIndexTurnEventCause(detail);
    if (!cause) {
      const pendingCount = completeTurnIndexAuthorityState.pendingDrafts.size;
      if (pendingCount) completeIndexRefreshCoordinator?.markPending?.(pendingCount);
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    if (cause === 'turn-stopped') {
      const qId = chatAtlasCompleteIndexIdentity(detail?.qId || detail?.questionId || detail?.turn?.qId);
      const pending = qId ? completeTurnIndexAuthorityState.pendingDrafts.get(qId) : null;
      if (pending) {
        completeTurnIndexAuthorityState.pendingDrafts.set(qId, {
          ...pending,
          stopped: true,
          noAnswer: true,
          completeIndexPending: true,
          livePendingProvenance: 'live-pending-overlay',
        });
        completeIndexRefreshCoordinator?.markPending?.(completeTurnIndexAuthorityState.pendingDrafts.size);
      }
    }
    const selectedPathEvidence = chatAtlasCompleteIndexSelectedPathEvidence(cause, detail);
    return chatAtlasScheduleCompleteIndexRefresh(cause, selectedPathEvidence
      ? { selectedPathEvidence }
      : {});
  }

  function chatAtlasBindCompleteIndexRefreshListeners() {
    if (completeTurnIndexAuthorityState.refreshListenerBound) return true;
    const onCanonicalTurnUpdated = (detail) => { void chatAtlasHandleCompleteIndexTurnEvent(detail || {}); };
    H2O.bus.on(EV_CORE_TURN_UPDATED, onCanonicalTurnUpdated);
    D.addEventListener('click', chatAtlasRecordTrustedNativeBranchSelection, true);
    completeTurnIndexAuthorityState.refreshListenerBound = true;
    completeTurnIndexAuthorityState.refreshListenerRegistrationCount += 1;
    return true;
  }

  const CHAT_ATLAS_FULL_INDEX_SAMPLE_LIMIT = 12;
  const CHAT_ATLAS_FULL_INDEX_PROVIDER_READY = 'evt:h2o:conversation-turn-index-provider:ready';
  const chatAtlasFullIndexState = {
    status: 'idle',
    chatId: null,
    routeKey: '',
    generation: 0,
    fetchCount: 0,
    startedAt: null,
    completedAt: null,
    errorCode: null,
    index: null,
    promise: null,
    controller: null,
    attempted: false,
  };

  function chatAtlasFullIndexRoute() {
    const pathname = String(W.location?.pathname || D.location?.pathname || '');
    const match = pathname.match(/(?:^|\/)c\/([a-z0-9-]+)(?:\/|$)/i);
    const chatId = match ? chatAtlasNormalizeId(match[1]) : '';
    return {
      chatId: chatId || null,
      routeKey: chatId ? pathname : '',
    };
  }

  function chatAtlasFullIndexReadMiniMapRows() {
    const readApi = (target) => {
      if (!target) return null;
      try {
        const candidate = target.H2O_MM_CORE_API
          || target.H2O_MM_SHARED?.get?.()?.api?.core
          || target.H2O_MM_SHARED?.api?.core
          || null;
        return typeof candidate?.getTurnList === 'function' ? candidate : null;
      } catch {
        return null;
      }
    };
    let topWindow = null;
    try { topWindow = W?.top || null; } catch { topWindow = null; }
    const api = readApi(topWindow) || readApi(W);
    if (!api) return [];
    try {
      const rows = api.getTurnList();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function chatAtlasFullIndexProjectionRow(row, order) {
    const qId = chatAtlasNormalizeId(row?.qId || row?.questionId || '') || null;
    const primaryAId = chatAtlasNormalizeId(row?.primaryAId || row?.answerId || '') || null;
    const rawVariants = Array.isArray(row?.answerVariants)
      ? row.answerVariants
      : (Array.isArray(row?.answerIds) ? row.answerIds : []);
    const answerVariants = [];
    for (const rawId of rawVariants) {
      const answerId = chatAtlasNormalizeId(rawId?.id || rawId);
      if (answerId && !answerVariants.includes(answerId)) answerVariants.push(answerId);
    }
    if (primaryAId && !answerVariants.includes(primaryAId)) answerVariants.push(primaryAId);
    return {
      order: Number(row?.order || row?.turnNo || row?.index || order) || order,
      qId,
      primaryAId,
      answerVariants,
      noAnswer: row?.noAnswer === true || (!primaryAId && answerVariants.length === 0),
    };
  }

  function chatAtlasFullIndexCompareProjection(indexTurns, rows, source) {
    const expected = (Array.isArray(indexTurns) ? indexTurns : [])
      .map((row, index) => chatAtlasFullIndexProjectionRow(row, index + 1));
    const actual = (Array.isArray(rows) ? rows : [])
      .map((row, index) => chatAtlasFullIndexProjectionRow(row, index + 1));
    const expectedByQId = new Map(expected.filter((row) => row.qId).map((row) => [row.qId, row]));
    const actualByQId = new Map(actual.filter((row) => row.qId).map((row) => [row.qId, row]));
    const samples = [];
    const pushSample = (kind, evidence = {}) => {
      if (samples.length >= CHAT_ATLAS_FULL_INDEX_SAMPLE_LIMIT) return;
      samples.push({ source, kind, ...evidence });
    };
    let missingCount = 0;
    let extraCount = 0;
    let orderMismatchCount = 0;
    let primaryMismatchCount = 0;
    let variantMismatchCount = 0;
    let noAnswerMismatchCount = 0;

    for (const expectedRow of expected) {
      if (!expectedRow.qId || actualByQId.has(expectedRow.qId)) continue;
      missingCount += 1;
      pushSample('missing-from-projection', { qId: expectedRow.qId });
    }
    for (const actualRow of actual) {
      if (!actualRow.qId || expectedByQId.has(actualRow.qId)) continue;
      extraCount += 1;
      pushSample('projection-only', { qId: actualRow.qId });
    }
    for (const [qId, expectedRow] of expectedByQId) {
      const actualRow = actualByQId.get(qId);
      if (!actualRow) continue;
      if (expectedRow.order !== actualRow.order) {
        orderMismatchCount += 1;
        pushSample('order-mismatch', { qId, expected: expectedRow.order, actual: actualRow.order });
      }
      if (expectedRow.primaryAId !== actualRow.primaryAId) {
        primaryMismatchCount += 1;
        pushSample('primary-mismatch', {
          qId,
          expected: expectedRow.primaryAId,
          actual: actualRow.primaryAId,
        });
      }
      if (JSON.stringify(expectedRow.answerVariants) !== JSON.stringify(actualRow.answerVariants)) {
        variantMismatchCount += 1;
        pushSample('variant-mismatch', {
          qId,
          expectedCount: expectedRow.answerVariants.length,
          actualCount: actualRow.answerVariants.length,
        });
      }
      if (expectedRow.noAnswer !== actualRow.noAnswer) {
        noAnswerMismatchCount += 1;
        pushSample('no-answer-mismatch', {
          qId,
          expected: expectedRow.noAnswer,
          actual: actualRow.noAnswer,
        });
      }
    }
    return {
      source,
      count: actual.length,
      missingCount,
      extraCount,
      orderMismatchCount,
      primaryMismatchCount,
      variantMismatchCount,
      noAnswerMismatchCount,
      samples,
    };
  }

  function chatAtlasCompareFullConversationIndex(index = chatAtlasFullIndexState.index) {
    const indexTurns = Array.isArray(index?.turns) ? index.turns : [];
    const canonical = chatAtlasFullIndexCompareProjection(indexTurns, listTurnRecords(), 'canonical');
    const ledger = chatAtlasFullIndexCompareProjection(
      indexTurns,
      buildChatAtlasLedgerCanonicalRecords(),
      'ledger',
    );
    const minimap = chatAtlasFullIndexCompareProjection(indexTurns, chatAtlasFullIndexReadMiniMapRows(), 'minimap');
    const sources = [canonical, ledger, minimap];
    const boundedSamples = [];
    for (const source of sources) {
      for (const sample of source.samples) {
        if (boundedSamples.length >= CHAT_ATLAS_FULL_INDEX_SAMPLE_LIMIT) break;
        boundedSamples.push(sample);
      }
    }
    const orderMismatchCount = sources.reduce((sum, item) => sum + item.orderMismatchCount, 0);
    const primaryMismatchCount = sources.reduce((sum, item) => sum + item.primaryMismatchCount, 0);
    const variantMismatchCount = sources.reduce((sum, item) => sum + item.variantMismatchCount, 0);
    const noAnswerMismatchCount = sources.reduce((sum, item) => sum + item.noAnswerMismatchCount, 0);
    const identityMismatch = sources.some((item) => (
      item.extraCount > 0
      || item.primaryMismatchCount > 0
      || item.variantMismatchCount > 0
      || item.noAnswerMismatchCount > 0
    ));
    const projectionIncomplete = sources.some((item) => item.missingCount > 0 && item.count < indexTurns.length);
    return {
      canonicalCount: canonical.count,
      ledgerCount: ledger.count,
      minimapCount: minimap.count,
      missingFromCanonicalCount: canonical.missingCount,
      extraInCanonicalCount: canonical.extraCount,
      missingFromLedgerCount: ledger.missingCount,
      extraInLedgerCount: ledger.extraCount,
      missingFromMiniMapCount: minimap.missingCount,
      extraInMiniMapCount: minimap.extraCount,
      orderMismatchCount,
      primaryMismatchCount,
      variantMismatchCount,
      noAnswerMismatchCount,
      projectionIncomplete,
      classification: projectionIncomplete
        ? 'projection-incomplete'
        : (identityMismatch ? 'identity-mismatch' : 'exact'),
      boundedSamples,
    };
  }

  function getConversationTurnIndexDiagnostics() {
    if (completeTurnIndexAuthorityState.enabled) {
      const authority = getCompleteTurnIndexProjectionStatus();
      const index = completeTurnIndexAuthorityState.index;
      const comparisons = index ? chatAtlasCompareFullConversationIndex(index) : null;
      return chatAtlasFreeze({
        status: authority.status,
        chatId: authority.chatId,
        fetchCount: authority.fetchCount,
        startedAt: authority.startedAt,
        completedAt: authority.completedAt,
        errorCode: authority.errorCode,
        index: authority.authoritative ? {
          schema: COMPLETE_TURN_INDEX_CACHE_SCHEMA,
          count: authority.count,
          fingerprint: authority.fingerprint,
          payloadUpdateTime: authority.payloadUpdateTime,
          completenessProof: authority.completenessProof,
          noAnswerCount: index.turns.filter((turn) => turn.noAnswer === true).length,
          variantTurnCount: index.turns.filter((turn) => turn.answerVariants.length > 1).length,
        } : null,
        comparisons,
        authority,
      });
    }
    const index = chatAtlasFullIndexState.index;
    const comparisons = index ? chatAtlasCompareFullConversationIndex(index) : null;
    const turns = Array.isArray(index?.turns) ? index.turns : [];
    return chatAtlasFreeze({
      status: chatAtlasFullIndexState.status,
      chatId: chatAtlasFullIndexState.chatId,
      fetchCount: chatAtlasFullIndexState.fetchCount,
      startedAt: chatAtlasFullIndexState.startedAt,
      completedAt: chatAtlasFullIndexState.completedAt,
      errorCode: chatAtlasFullIndexState.errorCode,
      index: index ? {
        schema: Number(index.schema || 0) || null,
        count: turns.length,
        fingerprint: String(index.sourceFingerprint || '') || null,
        payloadUpdateTime: index.payloadUpdateTime ?? null,
        completenessProof: String(index?.completeness?.proof || '') || null,
        noAnswerCount: turns.filter((turn) => turn?.noAnswer === true).length,
        variantTurnCount: turns.filter((turn) => Array.isArray(turn?.answerVariants) && turn.answerVariants.length > 1).length,
      } : null,
      comparisons,
    });
  }

  function chatAtlasResetFullIndexRoute(nextRoute, staleStatus = false) {
    try { chatAtlasFullIndexState.controller?.abort?.('route-changed'); } catch {}
    chatAtlasFullIndexState.generation += 1;
    chatAtlasFullIndexState.status = staleStatus ? 'stale-route-discarded' : 'idle';
    chatAtlasFullIndexState.chatId = nextRoute?.chatId || null;
    chatAtlasFullIndexState.routeKey = nextRoute?.routeKey || '';
    chatAtlasFullIndexState.fetchCount = 0;
    chatAtlasFullIndexState.startedAt = null;
    chatAtlasFullIndexState.completedAt = staleStatus ? new Date().toISOString() : null;
    chatAtlasFullIndexState.errorCode = null;
    chatAtlasFullIndexState.index = null;
    chatAtlasFullIndexState.promise = null;
    chatAtlasFullIndexState.controller = null;
    chatAtlasFullIndexState.attempted = false;
  }

  function chatAtlasTriggerFullConversationIndex() {
    if (completeTurnIndexAuthorityState.enabled) return chatAtlasTriggerCompleteIndexAuthority();
    const route = chatAtlasFullIndexRoute();
    const routeChanged = route.routeKey !== chatAtlasFullIndexState.routeKey
      || route.chatId !== chatAtlasFullIndexState.chatId;
    if (routeChanged) {
      const stale = chatAtlasFullIndexState.status === 'loading-full-index';
      chatAtlasResetFullIndexRoute(route, stale && !route.chatId);
    }
    if (!route.chatId) return Promise.resolve(getConversationTurnIndexDiagnostics());
    if (chatAtlasFullIndexState.promise) return chatAtlasFullIndexState.promise;
    if (chatAtlasFullIndexState.attempted) return Promise.resolve(getConversationTurnIndexDiagnostics());
    const provider = H2O.archiveBoot?.fetchConversationTurnIndex;
    if (typeof provider !== 'function') return Promise.resolve(getConversationTurnIndexDiagnostics());

    const Controller = W.AbortController;
    const controller = typeof Controller === 'function' ? new Controller() : null;
    const generation = chatAtlasFullIndexState.generation;
    const routeKey = route.routeKey;
    chatAtlasFullIndexState.attempted = true;
    chatAtlasFullIndexState.fetchCount += 1;
    chatAtlasFullIndexState.status = 'loading-full-index';
    chatAtlasFullIndexState.startedAt = new Date().toISOString();
    chatAtlasFullIndexState.completedAt = null;
    chatAtlasFullIndexState.errorCode = null;
    chatAtlasFullIndexState.controller = controller;
    const operation = Promise.resolve()
      .then(() => provider(route.chatId, { signal: controller?.signal }))
      .then((result) => {
        const stillCurrent = generation === chatAtlasFullIndexState.generation
          && routeKey === chatAtlasFullIndexState.routeKey
          && route.chatId === chatAtlasFullIndexState.chatId;
        if (!stillCurrent) {
          if (!chatAtlasFullIndexState.chatId && chatAtlasFullIndexState.status === 'idle') {
            chatAtlasFullIndexState.status = 'stale-route-discarded';
            chatAtlasFullIndexState.completedAt = new Date().toISOString();
          }
          return getConversationTurnIndexDiagnostics();
        }
        chatAtlasFullIndexState.completedAt = new Date().toISOString();
        const validIndex = result?.ok === true
          && Number(result?.index?.schema) === 1
          && chatAtlasNormalizeId(result?.index?.chatId) === route.chatId
          && result?.index?.completeness?.complete === true
          && result?.index?.completeness?.proof === 'host-payload-full-graph'
          && Array.isArray(result?.index?.turns);
        if (validIndex) {
          chatAtlasFullIndexState.index = result.index;
          chatAtlasFullIndexState.status = 'complete-from-host-payload';
          chatAtlasFullIndexState.errorCode = null;
        } else {
          chatAtlasFullIndexState.index = null;
          chatAtlasFullIndexState.status = 'full-index-unavailable';
          chatAtlasFullIndexState.errorCode = String(
            result?.errorCode
            || (result?.ok === true ? 'full-index-envelope-invalid' : 'full-index-unavailable'),
          ).slice(0, 96);
        }
        return getConversationTurnIndexDiagnostics();
      })
      .catch((error) => {
        if (generation === chatAtlasFullIndexState.generation && routeKey === chatAtlasFullIndexState.routeKey) {
          chatAtlasFullIndexState.index = null;
          chatAtlasFullIndexState.status = 'full-index-unavailable';
          chatAtlasFullIndexState.completedAt = new Date().toISOString();
          chatAtlasFullIndexState.errorCode = String(error?.code || 'provider-failed').slice(0, 96);
        }
        return getConversationTurnIndexDiagnostics();
      })
      .finally(() => {
        if (generation === chatAtlasFullIndexState.generation && routeKey === chatAtlasFullIndexState.routeKey) {
          chatAtlasFullIndexState.promise = null;
          chatAtlasFullIndexState.controller = null;
        }
      });
    chatAtlasFullIndexState.promise = operation;
    return operation;
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

  const sharedTurnRuntime = (
    H2O.turnRuntime
    && typeof H2O.turnRuntime === 'object'
    && !Array.isArray(H2O.turnRuntime)
  ) ? H2O.turnRuntime : {};
  Object.assign(sharedTurnRuntime, {
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
    getChatAtlasHistoricalCompleteness,
    getChatAtlasConvergenceParity,
    getConversationTurnIndexDiagnostics,
    getCompleteTurnIndexProjectionStatus,
    getChatAtlasBranchBadges,
    getChatAtlasEffectivePathIdentity,
    getChatAtlasDefaultLatestCreatedPath,
    getSelectedPathAcquisitionStatus,
    getSelectedPathDerivationDiagnostics,
    getGraphIdentityDiagnostics,
    getEffectivePresentationIndex,
    getEffectivePresentationStatus,
    getEffectiveTurnRecordByQId,
    getEffectiveTurnRecordByAId,
    setCompleteTurnIndexProjectionCanary,
    setCompleteTurnIndexAutoBranchReconciliationCanary,
    getCompleteTurnIndexProjectionPreference,
    setCompleteTurnIndexProjectionPreference,
    clearCompleteTurnIndexProjectionPreference,
    rebuildCompleteTurnIndexProjection,
    refreshCompleteTurnIndexProjection,
    getChatAtlasTurnStructureDiagnostics: getCanonicalTurnStructureDiagnostics,
    subscribeChatAtlasLedger,
    getChatAtlasCanonicalSource,
    setChatAtlasCanonicalSource,
    _reconcilePaginationSnapshot: (rows = []) => reconcileTurnRecordsFromPaginationSnapshot(rows),
    _clearPaginationSnapshot: () => clearPaginationTurnSnapshot(),
  });
  H2O.turnRuntime = sharedTurnRuntime;

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
  chatAtlasBindCompleteIndexRefreshListeners();

  W.addEventListener(EV_H2O_MESSAGE_REMOUNTED, () => scheduleRefresh('evt:remounted:h2o'));
  W.addEventListener(EV_H2O_INLINE_CHANGED, () => scheduleRefresh('evt:inline:h2o'));
  W.addEventListener('evt:h2o:route:changed', () => { chatAtlasTriggerFullConversationIndex(); });
  W.addEventListener('h2o:route:changed', () => { chatAtlasTriggerFullConversationIndex(); });
  W.addEventListener('popstate', () => { chatAtlasTriggerFullConversationIndex(); });
  W.addEventListener(CHAT_ATLAS_FULL_INDEX_PROVIDER_READY, () => { chatAtlasTriggerFullConversationIndex(); });

  chatAtlasApplyCompleteIndexProjectionPreferenceAtBoot();
  refresh('boot');
  startChatAtlasLedger();
  chatAtlasTriggerFullConversationIndex();

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
