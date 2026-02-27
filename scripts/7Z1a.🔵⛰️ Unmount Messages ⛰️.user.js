// ==UserScript==
// @h2o-id      7z.unmount.messages
// @name         7z.🔵⛰️ Unmount Messages ⛰️
// @namespace    H2O.ChatGPT.Unmount
// @version      1.2.5
// @description  Soft "virtual scrolling" for ChatGPT: unmount far-away messages (Q+A) to keep long pages light. Core-aware Turn numbering when available. Dock Panel compatible (remount + inline anchors). (h2o-* ➜ cgxui-*)
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Unmount Messages (Contract v2, Stage 1: Foundation / Mechanics)
   * - Identity-first + bounded DIAG
   * - No raw strings in logic: KEY_/EV_/SEL_/CSS_/CFG_/ATTR_/NS_/STR_
   * - boot/dispose idempotent + best-effort full cleanup
   * - Dock Panel compatible: emits InlineChanged + MsgRemounted (new + legacy)
   * - Scroll resilience: when unmounted, inject 1px invisible inline anchors so Panel clicks can scroll → triggers remount on proximity
   * - ✅ This pass only: h2o-* UI hooks renamed to cgxui-* (no feature changes)
   * ========================================================================== */

  /* ───────────────────────────── 0) Identity (Contract) ───────────────────────────── */

  /** @core Identity + namespace anchors (mechanics only). */
  const TOK = 'UM';
  const PID = 'nmntmssgs';
  const CID = 'unmountm';          // data/legacy label
  const SkID = 'nmms';

  const MODTAG = 'UnmountM';
  const MODICON = '⛰️';
  const EMOJI_HDR = '🔵';

  const SUITE = 'prm';
  const HOST = 'cgx';

  // ALIASES (readability only — NOT new identities)
  const DsID = PID;
  const BrID = PID;

  // for identifier names only
  const CID_UP = 'UNMOUNTM';

  /* ───────────────────────────── 0.1) Root Anchors ───────────────────────────── */

  /** @core Resolve window root (Tampermonkey safe). */
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  /** @core Root H2O vault (bounded). */
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};

  /** @core Module vault (Brain shelf). */
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };

  // Optional ecosystem registries (MODE B: warn + keep first)
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV = H2O.EV || {};
  H2O.SEL = H2O.SEL || {};
  H2O.UI = H2O.UI || {};

  /* ───────────────────────────── 1) Contract Tokens (CID: UNMOUNTM) ───────────────────────────── */

  // Memory namespace (window guard keys)
  const NS_MEM_UNMOUNTM_ROOT = `${TOK}:${PID}:guard`;

  // Window-guard keys (no raw literals outside constants)
  const KEY_UNMOUNTM_GUARD_BOOT = `${NS_MEM_UNMOUNTM_ROOT}:booted`;
  const KEY_UNMOUNTM_GUARD_STYLE = `${NS_MEM_UNMOUNTM_ROOT}:style`;
  const KEY_UNMOUNTM_GUARD_EVENTS = `${NS_MEM_UNMOUNTM_ROOT}:events`;
  const KEY_UNMOUNTM_GUARD_START_MO = `${NS_MEM_UNMOUNTM_ROOT}:startMO`;
  const KEY_UNMOUNTM_GUARD_INTERVAL = `${NS_MEM_UNMOUNTM_ROOT}:interval`;

  // Core topics (listened)
  const EV_UNMOUNTM_INDEX_UPDATED = 'h2o:index:updated';
  const EV_UNMOUNTM_TURN_UPDATED = 'h2o:turn:updated';

  // Dock Panel + ecosystem (emitted + listened)
  const EV_UNMOUNTM_INLINE_CHANGED = 'h2o:inline:changed';
  const EV_UNMOUNTM_INLINE_CHANGED_LEG = 'h2o-inline:changed';
  const EV_UNMOUNTM_INLINE_CHANGED_CANON = 'inline:changed';
  const EV_UNMOUNTM_INLINE_CHANGED_EVT = 'evt:h2o:inline:changed';

  const EV_UNMOUNTM_MSG_REMOUNTED = 'h2o:message:remounted';
  const EV_UNMOUNTM_MSG_REMOUNTED_LEG = 'h2o:message-remounted';
  const EV_UNMOUNTM_MSG_REMOUNTED_CANON = 'message:remounted';
  const EV_UNMOUNTM_MSG_REMOUNTED_EVT = 'evt:h2o:message:remounted';

  const EV_UNMOUNTM_MSG_MOUNT_REQ = 'h2o:message:mount:request';
  const EV_UNMOUNTM_MSG_MOUNT_REQ_LEG = 'h2o:message-mount-request';

  const EVENT_UNMOUNTM_INLINE_NAMES = Object.freeze([
    EV_UNMOUNTM_INLINE_CHANGED_EVT,
    EV_UNMOUNTM_INLINE_CHANGED,
    EV_UNMOUNTM_INLINE_CHANGED_LEG,
  ]);

  const EVENT_UNMOUNTM_REMOUNTED_NAMES = Object.freeze([
    EV_UNMOUNTM_MSG_REMOUNTED_EVT,
    EV_UNMOUNTM_MSG_REMOUNTED,
    EV_UNMOUNTM_MSG_REMOUNTED_LEG,
  ]);

  // cgxui style id
  const CSS_UNMOUNTM_STYLE_ID = `cgxui-${SkID}-style`;

  // DOM/data attribute names (KEEP legacy dataset keys for compatibility)
  const ATTR_UNMOUNTM_H2O_UID = 'h2oUid';
  const ATTR_UNMOUNTM_H2O_NUM = 'h2oNum';
  const ATTR_UNMOUNTM_H2O_UNMOUNTED = 'h2oUnmounted';
  const ATTR_UNMOUNTM_LEG_UID = 'hoUid';
  const ATTR_UNMOUNTM_LEG_NUM = 'hoNum';
  const ATTR_UNMOUNTM_LEG_UNMOUNTED = 'hoUnmounted';

  // cgxui ownership attribute name (Contract: data-cgxui-owner="SkID")
  const ATTR_UNMOUNTM_CGXUI_OWNER = 'cgxui-owner';

  // Internal marker keys (new + legacy, for compat)
  const ATTR_UNMOUNTM_MARKER_NEW = 'h2oUmMarker';
  const ATTR_UNMOUNTM_MARKER_LEG = 'h2oUmMarkerLegacy';

  // String tokens
  const STR_UNMOUNTM_ROLE_A = 'assistant';
  const STR_UNMOUNTM_ROLE_Q = 'user';

  /** @helper One-time per-node attr migration ho* -> h2o* */
  function UTIL_UM_migrateLegacyAttrs(el) {
    if (!el?.dataset) return;
    if (el.dataset[ATTR_UNMOUNTM_LEG_UID] && !el.dataset[ATTR_UNMOUNTM_H2O_UID]) {
      el.dataset[ATTR_UNMOUNTM_H2O_UID] = el.dataset[ATTR_UNMOUNTM_LEG_UID];
    }
    if (el.dataset[ATTR_UNMOUNTM_LEG_NUM] && !el.dataset[ATTR_UNMOUNTM_H2O_NUM]) {
      el.dataset[ATTR_UNMOUNTM_H2O_NUM] = el.dataset[ATTR_UNMOUNTM_LEG_NUM];
    }
    if (el.dataset[ATTR_UNMOUNTM_LEG_UNMOUNTED] && !el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED]) {
      el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED] = el.dataset[ATTR_UNMOUNTM_LEG_UNMOUNTED];
    }
  }

  const STR_UNMOUNTM_REASON_SCROLL = 'scroll';
  const STR_UNMOUNTM_REASON_RESIZE = 'resize';
  const STR_UNMOUNTM_REASON_VISIBLE = 'visible';
  const STR_UNMOUNTM_REASON_FOCUS = 'focus';
  const STR_UNMOUNTM_REASON_MO = 'mo';
  const STR_UNMOUNTM_REASON_BOOT = 'boot';
  const STR_UNMOUNTM_REASON_INTERVAL = 'interval';
  const STR_UNMOUNTM_REASON_CORE_INDEX = 'core:index';
  const STR_UNMOUNTM_REASON_CORE_TURN = 'core:turn';
  const STR_UNMOUNTM_REASON_INLINE = 'inline';
  const STR_UNMOUNTM_REASON_REMOUNTED = 'remounted';
  const STR_UNMOUNTM_REASON_MOUNT_REQ = 'mount:req';

  const STR_UNMOUNTM_RESTORE = 'remount';
  const STR_UNMOUNTM_FORCE = 'force';

  const STR_UNMOUNTM_A_PREFIX = 'a';
  const STR_UNMOUNTM_Q_PREFIX = 'q';

  const STR_UNMOUNTM_SRC_UNMOUNT = 'unmount';
  const STR_UNMOUNTM_LABEL_Q = '💬';
  const STR_UNMOUNTM_LABEL_A = '🤖';

  const STR_UNMOUNTM_ANCHOR_ATTR = 'data-h2o-anchor';
  const STR_UNMOUNTM_ANCHOR_ON = '1';

  const STR_UNMOUNTM_UNMOUNT_REASON = 'unmount';
  const STR_UNMOUNTM_REMOUNT_REASON = 'remount';
  const STR_UNMOUNTM_MOUNT_REQUEST_REASON = 'mount:request';

  // Selectors
  const SEL_UNMOUNTM_MSG_ANY = '[data-message-author-role="assistant"], [data-message-author-role="user"]';
  const SEL_UNMOUNTM_MSG_A = '[data-message-author-role="assistant"]';
  const SEL_UNMOUNTM_MSG_Q = '[data-message-author-role="user"]';

  // ✅ h2o-* ➜ cgxui-* UI selectors
  const SEL_UNMOUNTM_UNDER_UI = '.cgxui-under-ui';
  const SEL_UNMOUNTM_ANSWER_BODY = '.cgxui-answer-body';
  const SEL_UNMOUNTM_MARK_HL = 'mark.cgxui-inline-hl';

  const SEL_UNMOUNTM_PH = `.cgxui-${SkID}-ph`;
  const SEL_UNMOUNTM_HL_CACHE = `.cgxui-${SkID}-hl-cache`;
  const SEL_UNMOUNTM_HL_ANCHORS = `.cgxui-${SkID}-hl-anchors`;

  const SEL_UNMOUNTM_ROOT_MAIN = 'main';

  // Config
  const CFG_UNMOUNTM_MIN_MSGS_FOR_UNMOUNT = 25;          /* 👈👈👈  ↑ Num. messages → automatic soft-unmount */
  const CFG_UNMOUNTM_UNMOUNT_MARGIN_PX = 2000;
  const CFG_UNMOUNTM_PASS_MIN_INTERVAL_MS = 120;
  const CFG_UNMOUNTM_INTERVAL_MS = 20000;
  const CFG_UNMOUNTM_START_OBSERVER_SUBTREE = true;
  const CFG_UNMOUNTM_WAITER_TIMEOUT_MS = 1200;
  const CFG_UNMOUNTM_MOUNT_PROTECT_MS = 1600;
  const CFG_UNMOUNTM_DIAG_STEPS_MAX = 120;

  /* ───────────────────────────── 2) DIAG (bounded) ───────────────────────────── */

  /** @core DIAG state (bounded). */
  VAULT.diag = VAULT.diag || {
    ver: 'unmountm-contract-v2',
    bootCount: 0,
    lastBootAt: 0,
    steps: [],
    lastError: null,
  };

  /** @helper Push a DIAG step (ring buffer). */
  function DIAG_UM_step(name, extra) {
    const d = VAULT.diag;
    d.steps.push({ t: Date.now(), name, extra: extra ?? null });
    if (d.steps.length > CFG_UNMOUNTM_DIAG_STEPS_MAX) d.steps.shift();
  }

  /** @helper Safe diag wrapper. */
  function DIAG_UM_safe(name, extra) { try { DIAG_UM_step(name, extra); } catch (_) {} }

  /* ───────────────────────────── 3) State (bounded) ───────────────────────────── */

  VAULT.state = VAULT.state || {
    booted: false,

    // uid → { html } (ONLY while unmounted)
    unmountMap: new Map(),

    // scheduler / throttle
    scheduled: false,
    lastPassAt: 0,

    // message list cache
    msgsCache: [],
    msgsDirty: true,

    // listeners + timers
    onScroll: null,
    onResize: null,
    onVis: null,
    onFocus: null,
    onInlineChanged: null,
    onRemounted: null,
    onIndexUpdated: null,
    onTurnUpdated: null,
    onMountReq: null,

    rootMO: null,
    startMO: null,
    intervalT: 0,

    // waiters: uid -> Set<fn>
    remountWaiters: new Map(),

    // uid -> untilMs (protect from immediate re-unmount after a mount request)
    protectUntil: new Map(),
  };

  const S = VAULT.state;

  /* ───────────────────────────── 4) CSS Injection ───────────────────────────── */

  /** @core Inject styles once (cgxui style id). */
  function UI_UM_injectStyles() {
    if (document.getElementById(CSS_UNMOUNTM_STYLE_ID)) return;
    if (W[KEY_UNMOUNTM_GUARD_STYLE]) return;
    W[KEY_UNMOUNTM_GUARD_STYLE] = 1;

    const css = `
/* ===================== ${EMOJI_HDR} ${MODICON} ${MODTAG} ===================== */
[data-${ATTR_UNMOUNTM_CGXUI_OWNER}="${SkID}"].cgxui-${SkID}-ph{
  padding: 12px 16px;
  margin: 8px 0;
  border-radius: 10px;
  border: 1px dashed rgba(148,163,184,0.6);
  font-size: 12px;
  opacity: 0.7;
  font-style: italic;
  pointer-events: none;
  user-select: none;
}

/* 🔒 Hidden cache of inline highlights (for Panel inventory consistency) */
[data-${ATTR_UNMOUNTM_CGXUI_OWNER}="${SkID}"].cgxui-${SkID}-hl-cache{
  display: none !important;
}

/* 🧲 Invisible 1px anchors so Panel clicks can scroll even when unmounted */
[data-${ATTR_UNMOUNTM_CGXUI_OWNER}="${SkID}"].cgxui-${SkID}-hl-anchors{
  display: block;
  height: 0;
  overflow: hidden;
}
[data-${ATTR_UNMOUNTM_CGXUI_OWNER}="${SkID}"].cgxui-${SkID}-hl-anchors ${SEL_UNMOUNTM_MARK_HL}{
  display: inline-block !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  user-select: none !important;
}
`;

    const style = document.createElement('style');
    style.id = CSS_UNMOUNTM_STYLE_ID;
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  /* ───────────────────────────── 5) DOM/UTIL ───────────────────────────── */

  /** @helper Query all. */
  function UTIL_UM_qa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  /** @helper Mark message list dirty. */
  function CORE_UM_markMsgsDirty(reason) {
    S.msgsDirty = true;
    DIAG_UM_safe('msgs:dirty', reason || '');
  }

  /** @helper Get current messages (cached). */
  function CORE_UM_getMessages() {
    if (!S.msgsDirty && S.msgsCache.length) return S.msgsCache;
    S.msgsCache = UTIL_UM_qa(SEL_UNMOUNTM_MSG_ANY);
    S.msgsDirty = false;
    return S.msgsCache;
  }

  /** @helper Normalize ids (strip conversation-turn-). */
  function UTIL_UM_normalizeId(id) {
    return String(id || '').replace(/^conversation-turn-/, '').trim();
  }

  /** @helper Best-effort server message id. */
  function UTIL_UM_getServerMessageId(el) {
    const mid = el?.getAttribute?.('data-message-id');
    return mid ? UTIL_UM_normalizeId(mid) : '';
  }

  /** @helper Best-effort testid message id. */
  function UTIL_UM_getTestIdMessageId(el) {
    const t = el?.getAttribute?.('data-testid') || '';
    return t.startsWith('conversation-turn-') ? UTIL_UM_normalizeId(t) : '';
  }

  /** @helper Prefer QWrap stable id if exposed. */
  function UTIL_UM_getStableQuestionIdFallback(qEl) {
    if (typeof W.H2O_getStableQwrapId === 'function') {
      const v = W.H2O_getStableQwrapId(qEl);
      if (v) return UTIL_UM_normalizeId(v);
    }
    return '';
  }

  /** @helper Does inline store API exist? (prevents duplicates in DOM-collector fallback). */
  function UTIL_UM_hasInlineStoreAPI() {
    const api = W.H2OInline || W.H2O?.H2OInline || null;
    return !!(api && typeof api.listEntries === 'function');
  }

  /* ───────────────────────────── 6) Core-aware IDs + Turn Numbering ───────────────────────────── */

  /** @helper Core id getter (supports new + old Core shapes). */
  function CORE_UM_getCoreMsgId(H, el) {
    if (!H || !el) return '';
    const v1 = H?.msg?.getIdFromEl?.(el);
    if (v1) return UTIL_UM_normalizeId(v1);

    const role = el.getAttribute('data-message-author-role');
    if (role === STR_UNMOUNTM_ROLE_A) {
      const aId = H?.index?.getAId?.(el);
      if (aId) return UTIL_UM_normalizeId(aId);
    }
    if (role === STR_UNMOUNTM_ROLE_Q) {
      const qId = H?.index?.getQId?.(el);
      if (qId) return UTIL_UM_normalizeId(qId);
    }
    return '';
  }

  /** @helper Core turn getter (supports common Core shape). */
  function CORE_UM_getCoreTurnNo(H, el) {
    if (!H || !el) return 0;
    const role = el.getAttribute('data-message-author-role');
    if (role === STR_UNMOUNTM_ROLE_A) return (H?.turn?.getTurnIndexByAEl?.(el) || 0);
    if (role === STR_UNMOUNTM_ROLE_Q) return (H?.turn?.getTurnIndexByQEl?.(el) || 0);
    return 0;
  }

  /**
   * Assign shared numbering + stable ids:
   * ✅ BEST: Core turn-index
   * ✅ FALLBACK: assistant running count, pair preceding question to same number
   */
  function CORE_UM_ensureMessageIds(msgs) {
    const H = W.H2O;
    const hasCore = !!(H && (H.turn?.getTurnIndexByAEl || H.turn?.getTurnIndexByQEl));

    if (hasCore) {
      for (const el of msgs) {
        UTIL_UM_migrateLegacyAttrs(el);
        const uid = CORE_UM_getCoreMsgId(H, el) || '';
        const turnNo = CORE_UM_getCoreTurnNo(H, el) || 0;
        if (uid) el.dataset[ATTR_UNMOUNTM_H2O_UID] = uid;
        if (turnNo) el.dataset[ATTR_UNMOUNTM_H2O_NUM] = String(turnNo);
      }
      return;
    }

    let answerIndex = 0;
    let pendingQuestion = null;

    for (const el of msgs) {
      UTIL_UM_migrateLegacyAttrs(el);
      const role = el.getAttribute('data-message-author-role');

      const mid = UTIL_UM_getServerMessageId(el) || UTIL_UM_getTestIdMessageId(el);
      if (mid) el.dataset[ATTR_UNMOUNTM_H2O_UID] = mid;

      if (role === STR_UNMOUNTM_ROLE_A) {
        answerIndex += 1;
        const num = String(answerIndex);
        el.dataset[ATTR_UNMOUNTM_H2O_NUM] = num;

        if (!el.dataset[ATTR_UNMOUNTM_H2O_UID]) el.dataset[ATTR_UNMOUNTM_H2O_UID] = `${STR_UNMOUNTM_A_PREFIX}${num}`;

        if (pendingQuestion) {
          pendingQuestion.dataset[ATTR_UNMOUNTM_H2O_NUM] = num;

          const qmid =
            UTIL_UM_getServerMessageId(pendingQuestion) ||
            UTIL_UM_getTestIdMessageId(pendingQuestion) ||
            UTIL_UM_getStableQuestionIdFallback(pendingQuestion);

          if (qmid) pendingQuestion.dataset[ATTR_UNMOUNTM_H2O_UID] = qmid;
          if (!pendingQuestion.dataset[ATTR_UNMOUNTM_H2O_UID]) pendingQuestion.dataset[ATTR_UNMOUNTM_H2O_UID] = `${STR_UNMOUNTM_Q_PREFIX}${num}`;

          pendingQuestion = null;
        }
      } else if (role === STR_UNMOUNTM_ROLE_Q) {
        pendingQuestion = el;

        if (!el.dataset[ATTR_UNMOUNTM_H2O_UID]) {
          const qwrapId = UTIL_UM_getStableQuestionIdFallback(el);
          if (qwrapId) el.dataset[ATTR_UNMOUNTM_H2O_UID] = qwrapId;
        }

        if (!el.dataset[ATTR_UNMOUNTM_H2O_UID]) {
          el.dataset[ATTR_UNMOUNTM_H2O_UID] =
            'u' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
        }
      }
    }

    if (pendingQuestion && !pendingQuestion.dataset[ATTR_UNMOUNTM_H2O_NUM]) {
      const num = String(answerIndex + 1);
      pendingQuestion.dataset[ATTR_UNMOUNTM_H2O_NUM] = num;

      const qmid =
        UTIL_UM_getServerMessageId(pendingQuestion) ||
        UTIL_UM_getTestIdMessageId(pendingQuestion) ||
        UTIL_UM_getStableQuestionIdFallback(pendingQuestion);

      if (qmid) pendingQuestion.dataset[ATTR_UNMOUNTM_H2O_UID] = qmid;
      if (!pendingQuestion.dataset[ATTR_UNMOUNTM_H2O_UID]) pendingQuestion.dataset[ATTR_UNMOUNTM_H2O_UID] = `${STR_UNMOUNTM_Q_PREFIX}${num}`;
    }
  }

  /* ───────────────────────────── 7) Events (Dock Panel aligned) ───────────────────────────── */

  /** @helper DOM event emit (safe). */
  function UTIL_UM_emitDom(name, detail) {
    try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  }

  const CFG_EVENT_INLINE_CHANGED = Object.freeze({
    bus: EV_UNMOUNTM_INLINE_CHANGED_CANON,
    compat: EVENT_UNMOUNTM_INLINE_NAMES,
    dom: EVENT_UNMOUNTM_INLINE_NAMES,
  });

  const CFG_EVENT_REMOUNTED = Object.freeze({
    bus: EV_UNMOUNTM_MSG_REMOUNTED_CANON,
    compat: EVENT_UNMOUNTM_REMOUNTED_NAMES,
    dom: EVENT_UNMOUNTM_REMOUNTED_NAMES,
  });

  /** @helper Event emission config + fallback runner (bus → compat → DOM). */
  function CORE_UM_emitEventSet(config, payload) {
    const H = W.H2O;
    if (config?.bus && H?.events?.emit) {
      try { H.events.emit(config.bus, payload); } catch (_) {}
      return;
    }
    if (Array.isArray(config?.compat) && config.compat.length && H?.emitCompat) {
      for (const name of config.compat) {
        try { H.emitCompat(name, payload); } catch (_) {}
      }
      return;
    }
    if (Array.isArray(config?.dom) && config.dom.length) {
      for (const name of config.dom) {
        UTIL_UM_emitDom(name, payload);
      }
    }
  }

  /** @helper Payload marker (new + legacy). */
  function CORE_UM_applyMarker(payload) {
    payload[ATTR_UNMOUNTM_MARKER_NEW] = true;
    payload[ATTR_UNMOUNTM_MARKER_LEG] = true;
    return payload;
  }

  /** @helper Should ignore external event? */
  function CORE_UM_isMarkedDetail(detail) {
    if (!detail) return false;
    return !!(detail[ATTR_UNMOUNTM_MARKER_NEW] || detail[ATTR_UNMOUNTM_MARKER_LEG]);
  }

  /** @helper Notify inline-changed (Core-first, Dock Panel compatible). */
  function CORE_UM_emitInlineChanged(detail) {
    const payload = CORE_UM_applyMarker({
      ts: Date.now(),
      source: STR_UNMOUNTM_SRC_UNMOUNT,
      ...(detail || {}),
    });
    CORE_UM_emitEventSet(CFG_EVENT_INLINE_CHANGED, payload);
  }

  /** @helper Notify message-remounted (Core-first, Dock Panel compatible). */
  function CORE_UM_emitMessageRemounted(uid, why) {
    const payload = CORE_UM_applyMarker({
      id: uid,
      reason: why || STR_UNMOUNTM_RESTORE,
      ts: Date.now(),
      source: STR_UNMOUNTM_SRC_UNMOUNT,
    });
    CORE_UM_emitEventSet(CFG_EVENT_REMOUNTED, payload);

    const set = S.remountWaiters.get(uid);
    if (set && set.size) {
      set.forEach(fn => { try { fn(payload); } catch (_) {} });
      set.clear();
    }
  }

  /** @core Promise helper: wait until a specific uid is remounted. */
  function API_UM_waitUntilRemounted(uid, timeoutMs = CFG_UNMOUNTM_WAITER_TIMEOUT_MS) {
    const id = String(uid || '');
    if (!id) return Promise.resolve(null);

    return new Promise(resolve => {
      const t0 = performance.now();

      const tick = () => {
        const el = CORE_UM_findMessageByUid(id);
        const isUnmounted = !!(el && el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED] === '1');
        if (el && !isUnmounted) return resolve({ id, ok: true, via: 'already' });
        if (performance.now() - t0 > timeoutMs) return resolve({ id, ok: false, via: 'timeout' });
        requestAnimationFrame(tick);
      };

      if (!S.remountWaiters.has(id)) S.remountWaiters.set(id, new Set());
      S.remountWaiters.get(id).add(() => resolve({ id, ok: true, via: 'event' }));

      tick();
    });
  }

  /* ───────────────────────────── 8) Body Extraction (keeps under-ui mounted) ───────────────────────────── */

  function DOM_UM_getMessageBody(el) {
    if (!el) return null;

    const under = el.querySelector(SEL_UNMOUNTM_UNDER_UI);
    if (!under) return el;

    let body = el.querySelector(SEL_UNMOUNTM_ANSWER_BODY);
    if (!body) {
      body = document.createElement('div');
      body.className = SEL_UNMOUNTM_ANSWER_BODY.slice(1);

      const children = Array.from(el.childNodes);
      for (const node of children) {
        if (node.nodeType === 1 && node.classList.contains(SEL_UNMOUNTM_UNDER_UI.slice(1))) continue;
        body.appendChild(node);
      }
      el.insertBefore(body, under);
    }
    return body;
  }

  /* ───────────────────────────── 9) Unmount / Remount ───────────────────────────── */

  function DOM_UM_buildAnchorHTMLFromMarks(marks) {
    if (!marks || !marks.length) return '';
    if (!UTIL_UM_hasInlineStoreAPI()) return '';

    const wrap = document.createElement('div');
    wrap.className = SEL_UNMOUNTM_HL_ANCHORS.slice(1);
    wrap.classList.add(`cgxui-${SkID}-anchors`);
    wrap.setAttribute(`data-${ATTR_UNMOUNTM_CGXUI_OWNER}`, SkID);

    marks.forEach(m => {
      try {
        const c = m.cloneNode(true);
        c.setAttribute(STR_UNMOUNTM_ANCHOR_ATTR, STR_UNMOUNTM_ANCHOR_ON);
        wrap.appendChild(c);
      } catch (_) {}
    });

    return wrap.outerHTML || '';
  }

  function DOM_UM_buildHiddenCacheHTMLFromMarks(marks) {
    if (!marks || !marks.length) return '';
    const wrap = document.createElement('div');
    wrap.className = SEL_UNMOUNTM_HL_CACHE.slice(1);
    wrap.classList.add(`cgxui-${SkID}-cache`);
    wrap.setAttribute(`data-${ATTR_UNMOUNTM_CGXUI_OWNER}`, SkID);

    marks.forEach(m => {
      try { wrap.appendChild(m.cloneNode(true)); } catch (_) {}
    });
    return wrap.outerHTML || '';
  }

  /** @critical Soft-unmount one message. */
  function CORE_UM_softUnmount(el, uid) {
    const body = DOM_UM_getMessageBody(el);
    if (!body) return;
    if (el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED] === '1') return;

    const originalHTML = body.innerHTML;
    S.unmountMap.set(uid, { html: originalHTML });

    const marks = body.querySelectorAll(SEL_UNMOUNTM_MARK_HL);
    const anchorHTML = DOM_UM_buildAnchorHTMLFromMarks(Array.from(marks));
    const cacheHTML = DOM_UM_buildHiddenCacheHTMLFromMarks(Array.from(marks));

    const num = el.dataset[ATTR_UNMOUNTM_H2O_NUM] || '?';
    const role = el.getAttribute('data-message-author-role') || STR_UNMOUNTM_ROLE_A;

    const label =
      role === STR_UNMOUNTM_ROLE_Q
        ? `${STR_UNMOUNTM_LABEL_Q} Question ${num} collapsed for performance. Scroll closer to restore…`
        : `${STR_UNMOUNTM_LABEL_A} Answer ${num} collapsed for performance. Scroll closer to restore…`;

    const ph = document.createElement('div');
    ph.className = SEL_UNMOUNTM_PH.slice(1);
    ph.classList.add(`cgxui-${SkID}-ph`);
    ph.setAttribute(`data-${ATTR_UNMOUNTM_CGXUI_OWNER}`, SkID);
    ph.textContent = label;

    body.innerHTML = `${anchorHTML}${ph.outerHTML}${cacheHTML}`;
    el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED] = '1';

    if (marks.length) CORE_UM_emitInlineChanged({ answerId: uid, reason: STR_UNMOUNTM_UNMOUNT_REASON });
  }

  /** @critical Soft-remount one message. */
  function CORE_UM_softRemount(el, uid) {
    const body = DOM_UM_getMessageBody(el);
    const saved = S.unmountMap.get(uid);

    if (!body || !saved) {
      delete el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED];
      return;
    }

    body.innerHTML = saved.html;
    delete el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED];
    S.unmountMap.delete(uid);

    const hasMarks = !!body.querySelector(SEL_UNMOUNTM_MARK_HL);
    const role = el.getAttribute('data-message-author-role');

    if (!hasMarks && role === STR_UNMOUNTM_ROLE_A) {
      try { W.restoreInlineHighlights?.(el); } catch (_) {}
    }

    const nowHasMarks = !!body.querySelector(SEL_UNMOUNTM_MARK_HL);
    if (nowHasMarks) CORE_UM_emitInlineChanged({ answerId: uid, reason: STR_UNMOUNTM_REMOUNT_REASON });

    CORE_UM_emitMessageRemounted(uid, STR_UNMOUNTM_RESTORE);
  }

  /* ───────────────────────────── 10) Pass Scheduler ───────────────────────────── */

  function CORE_UM_scheduleUpdate(reason) {
    if (S.scheduled) return;
    S.scheduled = true;

    requestAnimationFrame(() => {
      S.scheduled = false;

      const now = performance.now();
      if (now - S.lastPassAt < CFG_UNMOUNTM_PASS_MIN_INTERVAL_MS) return;
      S.lastPassAt = now;

      CORE_UM_runUnmountPass(reason || '');
    });
  }

  function CORE_UM_findMessageByUid(uid) {
    const msgs = CORE_UM_getMessages();
    const id = String(uid || '');
    if (!id) return null;
    return msgs.find(el => el?.dataset?.[ATTR_UNMOUNTM_H2O_UID] === id) || null;
  }

  /** @core API: force remount by uid. */
  function API_UM_forceRemountByUid(uid, why) {
    const el = CORE_UM_findMessageByUid(uid);
    if (!el) return false;
    if (el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED] === '1') {
      CORE_UM_softRemount(el, String(uid));
      CORE_UM_emitMessageRemounted(String(uid), why || STR_UNMOUNTM_FORCE);
      return true;
    }
    return false;
  }

  /** @critical Main pass: unmount/remount based on distance from viewport. */
  function CORE_UM_runUnmountPass(reason) {
    const msgs = CORE_UM_getMessages();
    if (!msgs.length) return;

    CORE_UM_ensureMessageIds(msgs);

    if (msgs.length < CFG_UNMOUNTM_MIN_MSGS_FOR_UNMOUNT) return;

    const vpTop = W.scrollY;
    const vpBottom = vpTop + W.innerHeight;

    const aboveLine = vpTop - CFG_UNMOUNTM_UNMOUNT_MARGIN_PX;
    const belowLine = vpBottom + CFG_UNMOUNTM_UNMOUNT_MARGIN_PX;

    for (const el of msgs) {
      const uid = el?.dataset?.[ATTR_UNMOUNTM_H2O_UID];
      if (!uid) continue;

      const rect = el.getBoundingClientRect();
      const absTop = rect.top + W.scrollY;
      const absBottom = rect.bottom + W.scrollY;

      const isFar = (absBottom < aboveLine) || (absTop > belowLine);
      const isUnmounted = (el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED] === '1');

      // If Dock Panel asked for a remount, keep it mounted briefly even if still far.
      const until = S.protectUntil.get(uid) || 0;
      const isProtected = (until && until > Date.now());
      if (until && !isProtected) S.protectUntil.delete(uid);

      if ((isProtected && isUnmounted) || (!isFar && isUnmounted)) {
        CORE_UM_softRemount(el, uid);
      } else if (isFar && !isUnmounted && !isProtected) {
        CORE_UM_softUnmount(el, uid);
      }
    }

    DIAG_UM_safe('pass:ok', reason || '');
  }

  /* ───────────────────────────── 11) Boot / Dispose ───────────────────────────── */

  function CORE_UM_bindRuntimeOnce() {
    if (W[KEY_UNMOUNTM_GUARD_EVENTS]) return;
    W[KEY_UNMOUNTM_GUARD_EVENTS] = 1;

    S.onScroll = () => CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_SCROLL);
    S.onResize = () => CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_RESIZE);
    S.onVis = () => { if (!document.hidden) CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_VISIBLE); };
    S.onFocus = () => CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_FOCUS);

    W.addEventListener('scroll', S.onScroll, { passive: true });
    W.addEventListener('resize', S.onResize);
    document.addEventListener('visibilitychange', S.onVis);
    W.addEventListener('focus', S.onFocus);

    S.onIndexUpdated = () => { CORE_UM_markMsgsDirty(STR_UNMOUNTM_REASON_CORE_INDEX); CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_CORE_INDEX); };
    S.onTurnUpdated = () => { CORE_UM_markMsgsDirty(STR_UNMOUNTM_REASON_CORE_TURN); CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_CORE_TURN); };

    W.addEventListener(EV_UNMOUNTM_INDEX_UPDATED, S.onIndexUpdated);
    W.addEventListener(EV_UNMOUNTM_TURN_UPDATED, S.onTurnUpdated);

    S.onInlineChanged = (e) => {
      if (CORE_UM_isMarkedDetail(e?.detail)) return;
      CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_INLINE);
    };

    S.onRemounted = (e) => {
      if (CORE_UM_isMarkedDetail(e?.detail)) return;
      CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_REMOUNTED);
    };

    S.onMountReq = (e) => {
      // Dock Panel asks us to remount a specific message so it can scroll to a highlight mark.
      if (CORE_UM_isMarkedDetail(e?.detail)) return;
      const msgId = String(e?.detail?.msgId || e?.detail?.id || '');
      if (!msgId) return;

      // protect for a short window to avoid immediate re-unmount before Dock resolves the click
      const until = Date.now() + CFG_UNMOUNTM_MOUNT_PROTECT_MS;
      S.protectUntil.set(msgId, until);

      // best-effort immediate remount
      API_UM_forceRemountByUid(msgId, STR_UNMOUNTM_MOUNT_REQUEST_REASON);

      CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_MOUNT_REQ);
    };

    W.addEventListener(EV_UNMOUNTM_INLINE_CHANGED, S.onInlineChanged);
    W.addEventListener(EV_UNMOUNTM_INLINE_CHANGED_LEG, S.onInlineChanged);
    W.addEventListener(EV_UNMOUNTM_INLINE_CHANGED_EVT, S.onInlineChanged);

    W.addEventListener(EV_UNMOUNTM_MSG_REMOUNTED, S.onRemounted);
    W.addEventListener(EV_UNMOUNTM_MSG_REMOUNTED_LEG, S.onRemounted);
    W.addEventListener(EV_UNMOUNTM_MSG_REMOUNTED_EVT, S.onRemounted);

    W.addEventListener(EV_UNMOUNTM_MSG_MOUNT_REQ, S.onMountReq);
    W.addEventListener(EV_UNMOUNTM_MSG_MOUNT_REQ_LEG, S.onMountReq);

    if (!W[KEY_UNMOUNTM_GUARD_INTERVAL]) {
      W[KEY_UNMOUNTM_GUARD_INTERVAL] = 1;
      S.intervalT = W.setInterval(() => CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_INTERVAL), CFG_UNMOUNTM_INTERVAL_MS);
    }
  }

  function CORE_UM_installRootMO() {
    if (S.rootMO) return;
    if (typeof MutationObserver !== 'function') return;

    const root = document.querySelector(SEL_UNMOUNTM_ROOT_MAIN) || document.body;
    if (!root) return;

    S.rootMO = new MutationObserver((mutations) => {
      let relevant = false;
      for (const m of mutations) {
        if ((m.addedNodes && m.addedNodes.length) || (m.removedNodes && m.removedNodes.length)) { relevant = true; break; }
      }
      if (relevant) {
        CORE_UM_markMsgsDirty(STR_UNMOUNTM_REASON_MO);
        CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_MO);
      }
    });

    // light footprint
    S.rootMO.observe(root, { childList: true, subtree: false });
  }

  /** @core Boot (idempotent). */
  function CORE_UM_boot() {
    try {
      VAULT.diag.bootCount++;
      VAULT.diag.lastBootAt = Date.now();

      if (S.booted) return;
      S.booted = true;

      if (W[KEY_UNMOUNTM_GUARD_BOOT]) return;
      W[KEY_UNMOUNTM_GUARD_BOOT] = 1;

      UI_UM_injectStyles();
      CORE_UM_bindRuntimeOnce();
      CORE_UM_installRootMO();

      CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_BOOT);
      DIAG_UM_safe('boot:done', { ok: true, url: location.href });

    } catch (err) {
      VAULT.diag.lastError = String(err?.stack || err);
      DIAG_UM_safe('boot:crash', VAULT.diag.lastError);
      throw err;
    }
  }

  /** @core Dispose (best-effort full cleanup). */
  function CORE_UM_dispose() {
    try {
      if (S.onScroll) W.removeEventListener('scroll', S.onScroll);
      if (S.onResize) W.removeEventListener('resize', S.onResize);
      if (S.onVis) document.removeEventListener('visibilitychange', S.onVis);
      if (S.onFocus) W.removeEventListener('focus', S.onFocus);

      if (S.onIndexUpdated) W.removeEventListener(EV_UNMOUNTM_INDEX_UPDATED, S.onIndexUpdated);
      if (S.onTurnUpdated) W.removeEventListener(EV_UNMOUNTM_TURN_UPDATED, S.onTurnUpdated);

      if (S.onInlineChanged) {
        W.removeEventListener(EV_UNMOUNTM_INLINE_CHANGED, S.onInlineChanged);
        W.removeEventListener(EV_UNMOUNTM_INLINE_CHANGED_LEG, S.onInlineChanged);
        W.removeEventListener(EV_UNMOUNTM_INLINE_CHANGED_EVT, S.onInlineChanged);
      }

      if (S.onRemounted) {
        W.removeEventListener(EV_UNMOUNTM_MSG_REMOUNTED, S.onRemounted);
        W.removeEventListener(EV_UNMOUNTM_MSG_REMOUNTED_LEG, S.onRemounted);
        W.removeEventListener(EV_UNMOUNTM_MSG_REMOUNTED_EVT, S.onRemounted);
      }

      if (S.onMountReq) {
        W.removeEventListener(EV_UNMOUNTM_MSG_MOUNT_REQ, S.onMountReq);
        W.removeEventListener(EV_UNMOUNTM_MSG_MOUNT_REQ_LEG, S.onMountReq);
      }

      if (S.rootMO) { try { S.rootMO.disconnect(); } catch (_) {} S.rootMO = null; }
      if (S.startMO) { try { S.startMO.disconnect(); } catch (_) {} S.startMO = null; }

      if (S.intervalT) { clearInterval(S.intervalT); S.intervalT = 0; }

      try { document.getElementById(CSS_UNMOUNTM_STYLE_ID)?.remove(); } catch (_) {}

      try { S.unmountMap.clear(); } catch (_) {}
      try { S.remountWaiters.clear(); } catch (_) {}
      try { S.protectUntil.clear(); } catch (_) {}

      S.msgsCache = [];
      S.msgsDirty = true;
      S.scheduled = false;
      S.lastPassAt = 0;
      S.booted = false;

      DIAG_UM_safe('dispose:done', null);
    } catch (e) {
      DIAG_UM_safe('dispose:err', String(e?.stack || e));
    }
  }

  /* ───────────────────────────── 12) Public API (bounded) ───────────────────────────── */

  VAULT.api = VAULT.api || {};
  VAULT.api.boot = CORE_UM_boot;
  VAULT.api.dispose = CORE_UM_dispose;
  VAULT.api.forceRemountByUid = API_UM_forceRemountByUid;
  VAULT.api.waitUntilRemounted = API_UM_waitUntilRemounted;

  /* ───────────────────────────── 13) Start Gate ───────────────────────────── */

  function CORE_UM_waitForMessagesThenBoot() {
    if (W[KEY_UNMOUNTM_GUARD_START_MO]) return;
    W[KEY_UNMOUNTM_GUARD_START_MO] = 1;

    const tryBoot = () => {
      const msgs = CORE_UM_getMessages();
      if (msgs.length) {
        CORE_UM_boot();
        if (S.startMO) { try { S.startMO.disconnect(); } catch (_) {} S.startMO = null; }
      }
    };

    if (typeof MutationObserver !== 'function') {
      setTimeout(() => { tryBoot(); }, 350);
      return;
    }

    S.startMO = new MutationObserver(() => tryBoot());
    S.startMO.observe(document.documentElement, { childList: true, subtree: CFG_UNMOUNTM_START_OBSERVER_SUBTREE });

    tryBoot();
  }

  // single entry side-effect
  CORE_UM_waitForMessagesThenBoot();

})();
