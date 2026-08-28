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

  /* ── Chat Atlas policy seam (0A3a) ────────────────────────────────────────
   * The central Chat Atlas authority now lives in 0A3a Chat Atlas Core. H2O Core
   * keeps the generic turn model and reaches Chat Atlas only through the narrow
   * surface below: resolved per call, never holding a reference, and inert when
   * Chat Atlas is absent so generic turn building keeps working without it.
   */
  function chatAtlasCoreApi() {
    try {
      return (W.top || W).H2O_CHAT_ATLAS_CORE || W.H2O_CHAT_ATLAS_CORE || null;
    } catch {
      return null;
    }
  }

  // Policy READS — all fail closed to "no Chat Atlas authority".
  const chatAtlasBranchTransitionSuppressesLiveAppend = () => chatAtlasCoreApi()?.branchTransitionSuppressesLiveAppend?.() === true;
  const chatAtlasCompleteIndexAuthorityActive = () => chatAtlasCoreApi()?.completeIndexAuthorityActive?.() === true;
  const getEffectivePresentationIndex = (...a) => chatAtlasCoreApi()?.getEffectivePresentationIndex?.(...a) ?? null;
  const chatAtlasCompleteIndexCanonicalDrafts = (...a) => {
    const v = chatAtlasCoreApi()?.completeIndexCanonicalDrafts?.(...a);
    return Array.isArray(v) ? v : [];
  };
  const chatAtlasCompleteIndexLiveDrafts = (liveDrafts, ...a) => {
    const v = chatAtlasCoreApi()?.completeIndexLiveDrafts?.(liveDrafts, ...a);
    return Array.isArray(v) ? v : liveDrafts;
  };
  const chatAtlasCompleteIndexPendingCanonicalDrafts = (...a) => {
    const v = chatAtlasCoreApi()?.completeIndexPendingCanonicalDrafts?.(...a);
    return Array.isArray(v) ? v : [];
  };
  const chatAtlasReadEvidence = (...a) => chatAtlasCoreApi()?.readEvidence?.(...a) ?? null;
  const chatAtlasPairEvidence = (...a) => {
    const v = chatAtlasCoreApi()?.pairEvidence?.(...a);
    return Array.isArray(v) ? v : [];
  };

  // Semantic COMMANDS. H2O Core never mutates Chat Atlas state directly; the
  // owner performs its own writes. A missing Chat Atlas simply drops the
  // telemetry rather than throwing.
  const noteBranchTransitionSuppressedLiveAppend = () => chatAtlasCoreApi()?.noteBranchTransitionSuppressedLiveAppend?.();
  const clearTrustedSelectedPathIntent = () => chatAtlasCoreApi()?.clearTrustedSelectedPathIntent?.();
  // Narrow query for generic turn building: the authority index only, never the
  // authority state object.
  const chatAtlasCompleteIndexAuthorityIndex = () => chatAtlasCoreApi()?.completeIndexAuthorityIndex?.() ?? null;


  /* ── Chat Atlas Core broker seam (0A3a) ──────────────────────────────────
   * The Ledger subsystem moved out of H2O Core into 0A3b Chat Atlas Ledger and
   * is reached only through the 0A3a broker, so H2O Core has no dependency on
   * the Ledger file at all. Every lookup below resolves per call and is inert
   * when Chat Atlas Core or the Ledger has not registered — generic turn
   * building must never require either of them.
   */

  /* ── Peripheral Chat Atlas subdomains (0A3a) ──────────────────────────────
   * Reveal / pager / scroll and the Full Index diagnostics moved into Chat
   * Atlas Core. H2O Core still owns the central authority pipeline until
   * Milestone 2B-2, so it reaches these through the same broker it already
   * uses, resolved per call and inert when Chat Atlas Core is absent.
   */
  const chatAtlasTriggerFullConversationIndex = (...a) => chatAtlasCoreApi()?.triggerFullConversationIndex?.(...a);
  const getConversationTurnIndexDiagnostics = (...a) => chatAtlasCoreApi()?.getConversationTurnIndexDiagnostics?.(...a) ?? null;




  // Canonical draft policy. Default canonical source is 'legacy' and nothing in
  // production switches it, so with no broker or no Ledger the caller's own
  // drafts pass straight through unchanged.
  const selectChatAtlasCanonicalDrafts = (legacyDrafts) => {
    const api = chatAtlasCoreApi();
    if (!api || typeof api.selectCanonicalDrafts !== 'function') return legacyDrafts;
    const out = api.selectCanonicalDrafts(legacyDrafts, null);
    return (out === undefined || out === null) ? legacyDrafts : out;
  };



  const startChatAtlasLedger = (...args) => chatAtlasCoreApi()?.startLedger?.(...args);

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
    lastPublishedSemanticIdentity: null,
    lastPublishedMountIdentity: null,
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
    duplicateAnswerAppendSuppressedCount: 0,
    ambiguousAnswerOwnerCount: 0,
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
































































  /* Chat Atlas convergence parity (CV-1, explicit read-only probe).
   *
   * This operator-called API compares the private Chat Atlas ledger, current
   * canonical turnRuntime records, and rendered MiniMap boxes. It does not
   * participate in normal diagnostics, publish rows, or invoke repair paths.
   */































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
    if (
      !candidates.length
      && !(turnState.paginationDrafts && turnState.paginationDrafts.length)
      // Host turn ordinals are window-relative and reassign on rematerialization,
      // so ordinal adoption is only a legacy-scan crutch. Under complete-index
      // authority every canonical draft carries stable identity: a draft that
      // matches no record is a genuinely new turn and must append, never adopt
      // an unrelated record by position.
      && !(typeof chatAtlasCompleteIndexAuthorityActive === 'function'
        && chatAtlasCompleteIndexAuthorityActive())
    ) {
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

  /* An assistant-only draft names a canonical answer but carries no question of
     its own. Windowing can mount an answer whose question shell sits behind a
     gap, and the cross-gap fix deliberately emits that draft unpaired rather
     than rebinding it to whichever question happens to precede it — that
     protection stands. What it cannot see is that the answer may already belong
     to a committed turn whose question matched separately from its own mounted
     shell: canonicalLiveDraftMatch() skips records already consumed this pass,
     so the owner is invisible to the answer-identity tier and the draft is
     appended as a second turn claiming one answer message. Membership would
     then follow the mounted window instead of the conversation.

     Ownership is proven by canonical answer identity alone — never proximity,
     ordinal, or DOM neighbour — so this stays narrower than the rebinding the
     cross-gap fix forbids. It applies only to drafts with no question of their
     own, and fails closed unless exactly one committed turn claims the answer. */
  function canonicalCommittedAnswerOwner(records, draft) {
    if (normalizeTurnAlias(draft?.qId || '')) {
      return { record: null, basis: 'draft-owns-question', candidateCount: 0 };
    }
    const draftAnswers = canonicalDraftAnswerIds(draft);
    if (!draftAnswers.size) {
      return { record: null, basis: 'draft-without-answer-identity', candidateCount: 0 };
    }
    const owners = (Array.isArray(records) ? records : []).filter((record) => {
      if (!record || canonicalQIdsConflict(record, draft)) return false;
      const recordAnswers = canonicalRecordAnswerIds(record);
      return Array.from(draftAnswers).some((value) => recordAnswers.has(value));
    });
    if (owners.length === 1) {
      return { record: owners[0], basis: 'committed-answer-identity', candidateCount: 1 };
    }
    return {
      record: null,
      basis: owners.length ? 'ambiguous-answer-owner' : 'unclaimed-answer-identity',
      candidateCount: owners.length,
    };
  }

  /* applyLiveDraft() replaces record.live wholesale, which would drop the
     question element the owner already bound from its own mounted shell. The
     mounted answer evidence is merged in place instead, and no identity field
     is touched: the owning turn keeps its qId, answer set and turn id. */
  function bindLiveAnswerEvidenceToOwner(record, draft) {
    if (!record || !draft) return record;
    if (!record.live) record.live = { qEl: null, primaryAEl: null, answerEls: [], connected: false };
    const live = record.live;
    const primaryAEl = draft?.live?.primaryAEl || null;
    if (primaryAEl && !live.primaryAEl) live.primaryAEl = primaryAEl;
    const draftAnswerEls = Array.isArray(draft?.live?.answerEls)
      ? draft.live.answerEls.filter(Boolean)
      : [];
    if (draftAnswerEls.length) {
      const existing = Array.isArray(live.answerEls) ? live.answerEls.filter(Boolean) : [];
      live.answerEls = Array.from(new Set([...existing, ...draftAnswerEls]));
    }
    if (draft?.live?.connected) live.connected = true;
    return refreshLegacyTurnCompat(record);
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
      // A trusted branch transition replaces mounted content while the
      // committed list still describes the outgoing branch. A mounted turn
      // that cannot be matched against current authority in that window
      // belongs to the incoming branch; appending it publishes a hybrid count
      // (outgoing branch + one foreign turn) that no complete branch ever
      // had. Suppress the append until branch authority settles — the turn
      // re-enters through the validated branch index or a later clean commit.
      if (chatAtlasBranchTransitionSuppressesLiveAppend()) {
        noteBranchTransitionSuppressedLiveAppend();
        continue;
      }
      // A mounted answer whose turn is already committed is evidence about that
      // turn, not a turn of its own. Bind it to its owner instead of publishing
      // a second turn for the same answer message.
      const answerOwner = canonicalCommittedAnswerOwner(nextRecords, draft);
      if (answerOwner.record) {
        turnState.duplicateAnswerAppendSuppressedCount += 1;
        bindLiveAnswerEvidenceToOwner(answerOwner.record, draft);
        continue;
      }
      if (answerOwner.basis === 'ambiguous-answer-owner') {
        // More than one committed turn already claims this answer. Choosing one
        // would invent an owner and appending would add a third; leave the
        // committed set alone and let the ambiguity surface in diagnostics.
        turnState.ambiguousAnswerOwnerCount += 1;
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
        || chatAtlasCompleteIndexAuthorityIndex();
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



  // CV-3.4 Gate 4 refresh production seam:end
























































































  // ── The complete nested branch-selection vector ───────────────────────────
  // Every branch point on the authoritative path — question edits AND assistant
  // regenerations — read from the SAME retained identity graph the branch was
  // derived from. Declarative: it never touches the DOM and never activates.












  // ── Default path: the newest-created terminal ─────────────────────────────
  // The default branch is the complete root-to-leaf path whose eligible
  // terminal message was created last. Never the longest path, never the
  // mounted DOM order, never a branch number, never graph array order.










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





























































































































































  const CHAT_ATLAS_FULL_INDEX_PROVIDER_READY = 'evt:h2o:conversation-turn-index-provider:ready';









  function coreIndexSemanticIdentity() {
    return JSON.stringify(turnState.turns.map((turn) => [
      Number(turn?.turnNo || 0),
      String(turn?.qId || ''),
      String(turn?.primaryAId || ''),
      turn?.noAnswer === true ? 1 : 0,
      turn?.stopped === true ? 1 : 0,
    ]));
  }

  function coreIndexMountIdentity() {
    return JSON.stringify([
      state.qList.map((row) => String(row?.id || '')),
      state.aList.map((row) => String(row?.id || '')),
    ]);
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

    const semanticIdentity = coreIndexSemanticIdentity();
    const mountIdentity = coreIndexMountIdentity();
    if (
      semanticIdentity !== state.lastPublishedSemanticIdentity
      || mountIdentity !== state.lastPublishedMountIdentity
    ) {
      const emitFn = H2O.events?.emit || H2O.bus?.emit || busEmit;
      emitFn(EV_CORE_INDEX_UPDATED, {
        reason,
        version: state.version,
        qTotal: state.qList.length,
        aTotal: state.aList.length,
        turnTotal: turnState.turns.length,
      });
      state.lastPublishedSemanticIdentity = semanticIdentity;
      state.lastPublishedMountIdentity = mountIdentity;
    }

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
    _reconcilePaginationSnapshot: (rows = []) => reconcileTurnRecordsFromPaginationSnapshot(rows),
    _clearPaginationSnapshot: () => clearPaginationTurnSnapshot(),
  });

  /* ── Host surface consumed by 0A3b Chat Atlas Ledger via the 0A3a broker ──
   * The extracted Ledger still reads the generic turn model and — until
   * Milestone 2B relocates them — the central Chat Atlas helpers that remain in
   * this file. It reaches them through 0A3a rather than importing anything, so
   * the dependency runs H2O Core -> Chat Atlas Core -> Ledger and never back.
   * These are the nine generic H2O reads Chat Atlas Core and the Ledger still
   * need. Everything Chat-Atlas-owned has moved out; nothing here is mutable
   * from the consumer side.
   */
  const CHAT_ATLAS_HOST_SURFACE = {
    turnState,
    state,
    listTurnRecords,
    buildTurns,
    buildCanonicalTurnId,
    busEmit,
    canonicalDraftHasStructuralQuestionProof,
    getMsgIdAttr,
    getRecordByQIdInternal,
    isStreamingAnswerPlaceholderId,
    normalizeTurnAlias,
    refresh,
    slimTurnDraft,
  };
  try { (W.top || W).H2O_CHAT_ATLAS_HOST_V1 = CHAT_ATLAS_HOST_SURFACE; } catch {}
  try { W.H2O_CHAT_ATLAS_HOST_V1 = CHAT_ATLAS_HOST_SURFACE; } catch {}

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

  W.addEventListener(EV_H2O_MESSAGE_REMOUNTED, () => scheduleRefresh('evt:remounted:h2o'));
  W.addEventListener(EV_H2O_INLINE_CHANGED, () => scheduleRefresh('evt:inline:h2o'));
  W.addEventListener('evt:h2o:route:changed', () => { chatAtlasTriggerFullConversationIndex(); });
  W.addEventListener('h2o:route:changed', () => { chatAtlasTriggerFullConversationIndex(); });
  W.addEventListener('popstate', () => { chatAtlasTriggerFullConversationIndex(); });
  W.addEventListener(CHAT_ATLAS_FULL_INDEX_PROVIDER_READY, () => { chatAtlasTriggerFullConversationIndex(); });

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
