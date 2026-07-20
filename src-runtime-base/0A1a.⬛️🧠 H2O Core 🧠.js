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
      const index = completeTurnIndexAuthorityState.index;
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
      const Controller = adapters?.AbortController || globalThis.AbortController;
      const controller = typeof Controller === 'function' ? new Controller() : null;
      const generation = state.generation + 1;
      state.generation = generation;
      state.routeKey = routeKey();
      state.fetchCount += 1;
      state.controller = controller;
      state.startedAt = iso(now());
      state.completedAt = null;
      state.errorCode = null;
      state.selectedPathActiveEvidence = state.selectedPathPendingEvidence;
      state.selectedPathPendingEvidence = null;
      if (state.selectedPathActiveEvidence) {
        adapters?.trace?.('selected-refresh-started', {
          cause: state.selectedPathActiveEvidence.cause,
          qId: state.selectedPathActiveEvidence.qId,
          trusted: state.selectedPathActiveEvidence.trusted === true,
          token: state.selectedPathActiveEvidence.selectionToken,
          confirmationAttempt: state.selectedPathActiveEvidence.confirmationAttempt === true,
        });
      }
      const causes = causeSample();
      state.causes.clear();
      notify('complete-refreshing');

      const timeoutPromise = new Promise((resolve) => {
        state.timeoutTimer = (adapters?.setTimeout || setTimeout)(() => {
          try { controller?.abort?.('refresh-timeout'); } catch {}
          resolve({ timeout: true });
        }, Math.max(100, Number(limits.timeoutMs || 4500)));
      });
      const providerPromise = Promise.resolve()
        .then(() => provider(chatId, { signal: controller?.signal, causes }))
        .then((value) => ({ value }), (error) => ({ error }));

      const operation = Promise.race([providerPromise, timeoutPromise])
        .then((outcome) => {
          const current = generation === state.generation && state.routeKey === routeKey() && enabled();
          if (!current) {
            state.staleDiscardCount += 1;
            return snapshot();
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
    return Object.freeze({ schedule, refresh, cancel, markPending, getStatus: snapshot, limits });
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
      reason: answerResolved ? 'capture-owner-answer-resolved' : 'capture-owner-qid-resolved',
    };
  }

  function chatAtlasRecordTrustedNativeBranchSelection(event) {
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
    completeTurnIndexAuthorityState.trustedSelectionSequence += 1;
    completeTurnIndexAuthorityState.trustedSelectionCaptureCount += 1;
    const observedAt = Date.now();
    const tokenIdentity = [
      Number(completeTurnIndexAuthorityState.generation || 0),
      route.chatId,
      route.routeKey,
      completeTurnIndexAuthorityState.trustedSelectionSequence,
      direction,
      observedAt,
    ];
    const token = `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(tokenIdentity))}`;
    const priorIntent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
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
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
      // A newer click that fails ownership must still cancel any prior click's
      // pending post-event reconciliation task.
      chatAtlasCancelTrustedNativeBranchReconcile();
      chatAtlasTraceTrustedLifecycle('trusted-bind-skipped', { reason: ownership.reason, token });
      return false;
    }
    completeTurnIndexAuthorityState.trustedSelectedPathIntent = Object.freeze({
      token,
      chatId: route.chatId,
      routeKey: route.routeKey,
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
      direction,
      qId: ownership.qId,
      observedAt,
    });
    chatAtlasTraceTrustedLifecycle('trusted-bind-success', {
      qId: ownership.qId,
      token,
      reason: ownership.reason,
    });
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
    const ageExpired = age > Number(COMPLETE_TURN_INDEX_REFRESH_LIMITS.trustedSelectionWindowMs || 5000);
    const authoritative = completeTurnIndexAuthorityState.enabled
      && intent.chatId === completeTurnIndexAuthorityState.chatId
      && intent.routeKey === completeTurnIndexAuthorityState.routeKey
      && intent.generation === Number(completeTurnIndexAuthorityState.generation || 0)
      && !ageExpired;
    if (!authoritative) {
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
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
    if (intent && evidence?.selectionToken === intent.token) {
      completeTurnIndexAuthorityState.trustedSelectedPathIntent = null;
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
    const trustedSelection = chatAtlasCurrentTrustedNativeBranchSelection(qId);
    const identity = [
      Number(completeTurnIndexAuthorityState.generation || 0),
      String(completeTurnIndexAuthorityState.chatId || ''),
      qId,
      observedAnswerId,
      String(index?.sourceFingerprint || ''),
      String(index?.payloadUpdateTime ?? ''),
      cause,
      String(trustedSelection?.token || ''),
      captureDriven ? `baseline:${baselineAnswerId}` : '',
    ];
    const evidence = Object.freeze({
      signature: `djb2:${chatAtlasCompleteIndexStableHash(JSON.stringify(identity))}`,
      cause,
      qId,
      observedAnswerId,
      trusted: !!trustedSelection,
      selectionToken: String(trustedSelection?.token || ''),
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
    for (const qId of qIds) {
      completeTurnIndexAuthorityState.pendingDrafts.delete(qId);
      completeTurnIndexAuthorityState.pendingObservedAt.delete(qId);
    }
    const eligiblePending = source.filter((draft) => chatAtlasCompleteIndexPendingDraftEligible(draft, index));
    const latestPending = eligiblePending[eligiblePending.length - 1] || null;
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
    const detail = getCompleteTurnIndexProjectionStatus();
    try { W.dispatchEvent(new CustomEvent(COMPLETE_TURN_INDEX_STATE_EVENT, { detail })); } catch {}
    try { H2O.events?.emit?.(COMPLETE_TURN_INDEX_STATE_EVENT, detail); } catch {}
    try {
      const api = W.H2O_MM_CORE_API || W.top?.H2O_MM_CORE_API || null;
      api?.scheduleRebuild?.(`complete-index:${detail.status}`);
    } catch {}
    return detail;
  }

  function chatAtlasPublishCompleteIndex(envelope, source) {
    completeTurnIndexAuthorityState.index = envelope;
    completeTurnIndexAuthorityState.indexSource = source;
    buildTurns();
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
        return provider(chatId, opts);
      };
    },
    normalize: (raw, chatId) => chatAtlasNormalizeCompleteIndexEnvelope(raw, chatId, { source: 'host' }),
    compareRevision: chatAtlasCompareCompleteIndexRevision,
    selectedPathConfirmed: chatAtlasCompleteIndexSelectedPathConfirmed,
    selectedPathEvidenceCurrent: chatAtlasCompleteIndexSelectedPathEvidenceCurrent,
    selectedPathLeaseCurrent: chatAtlasCompleteIndexSelectedPathLeaseCurrent,
    routeGeneration: () => Number(completeTurnIndexAuthorityState.generation || 0),
    onSelectedPathResolved: chatAtlasResolveTrustedNativeBranchSelection,
    trace: chatAtlasTraceTrustedLifecycle,
    writeCache: (envelope) => {
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

  function chatAtlasResetCompleteIndexRoute(nextRoute, staleStatus = false) {
    const clearedIntent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    chatAtlasCancelTrustedNativeBranchReconcile();
    completeIndexRefreshCoordinator?.cancel?.(
      staleStatus ? 'route-changed' : 'authority-reset',
      staleStatus ? 'stale-route-discarded' : 'idle',
    );
    try { completeTurnIndexAuthorityState.controller?.abort?.('route-changed'); } catch {}
    completeTurnIndexAuthorityState.generation += 1;
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
      .then(() => provider(route.chatId, { signal: controller?.signal }))
      .then((result) => {
        const stillCurrent = generation === completeTurnIndexAuthorityState.generation
          && routeKey === completeTurnIndexAuthorityState.routeKey
          && route.chatId === completeTurnIndexAuthorityState.chatId;
        if (!stillCurrent) {
          completeTurnIndexAuthorityState.staleDiscardCount += 1;
          return getCompleteTurnIndexProjectionStatus();
        }
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
    chatAtlasResetCompleteIndexRoute(chatAtlasFullIndexRoute(), false);
    return chatAtlasTriggerCompleteIndexAuthority();
  }

  function refreshCompleteTurnIndexProjection(cause = 'explicit-rebuild') {
    if (!completeTurnIndexAuthorityState.enabled) {
      return Promise.resolve(getCompleteTurnIndexProjectionStatus());
    }
    return chatAtlasScheduleCompleteIndexRefresh(String(cause || 'explicit-rebuild'), { immediate: true });
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
    getChatAtlasHistoricalCompleteness,
    getChatAtlasConvergenceParity,
    getConversationTurnIndexDiagnostics,
    getCompleteTurnIndexProjectionStatus,
    setCompleteTurnIndexProjectionCanary,
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
