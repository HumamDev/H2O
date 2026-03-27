// ==UserScript==
// @h2o-id             0w1a.unmount.messages
// @name               0W1a.⬛️⛰️ Unmount Messages ⛰️
// @namespace          H2O.Premium.CGX.unmount.messages
// @author             HumamDev
// @version            1.3.1
// @revision           002
// @build              260328-002627
// @description        Soft "virtual scrolling" for ChatGPT: unmount far-away messages (Q+A) to keep long pages light. Core-aware Turn numbering when available. Dock Panel compatible (remount + inline anchors). (h2o-* ➜ cgxui-*)
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
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
  const EV_UNMOUNTM_MINIMAP_PHASE_EVT = 'evt:h2o:minimap:phase';
  const EV_UNMOUNTM_MINIMAP_PHASE = 'h2o:minimap:phase';
  const EV_UNMOUNTM_CFG_CHANGED_EVT = 'evt:h2o:unmount:configchanged';

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
  const ATTR_UNMOUNTM_QREV_CUR = 'h2oQRevCur';
  const ATTR_UNMOUNTM_QREV_TOTAL = 'h2oQRevTotal';
  const ATTR_UNMOUNTM_AREV_CUR = 'h2oARevCur';
  const ATTR_UNMOUNTM_AREV_TOTAL = 'h2oARevTotal';
  const ATTR_UNMOUNTM_TURN_HIDDEN = 'h2oUmTurnHidden';

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
  const SEL_UNMOUNTM_QUOTE_CACHE = `.cgxui-${SkID}-quote-cache`;
  const SEL_UNMOUNTM_REV_CACHE = `.cgxui-${SkID}-rev-cache`;
  const SEL_UNMOUNTM_QUOTE_BOX = '.cgxui-qswr-quoteBox';
  const SEL_UNMOUNTM_TABULAR_NUMS = '.tabular-nums';
  const SEL_UNMOUNTM_CONV_TURN = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
  const SEL_UNMOUNTM_TURN_MSG_GROUP = '[class*="group/turn-messages"]';

  const SEL_UNMOUNTM_ROOT_MAIN = 'main';

  // Config
  const NS_DISK_UNMOUNTM = `h2o:${SUITE}:${HOST}:${DsID}`;
  const KEY_UNMOUNTM_CFG_V1 = `${NS_DISK_UNMOUNTM}:cfg:runtime:v1`;
  const CFG_UNMOUNTM_DEFAULT_ENABLED = true;
  const CFG_UNMOUNTM_DEFAULT_MIN_MSGS_FOR_UNMOUNT = 25;  /* 👈👈👈  ↑ Num. messages → automatic soft-unmount */
  const CFG_UNMOUNTM_DEFAULT_UNMOUNT_MARGIN_PX = 2000;
  const CFG_UNMOUNTM_DEFAULT_RESTORE_MODE = 'both';
  const CFG_UNMOUNTM_DEFAULT_PASS_MIN_INTERVAL_MS = 120;
  const CFG_UNMOUNTM_DEFAULT_INTERVAL_MS = 20000;
  const CFG_UNMOUNTM_START_OBSERVER_SUBTREE = true;
  const CFG_UNMOUNTM_WAITER_TIMEOUT_MS = 1200;
  const CFG_UNMOUNTM_DEFAULT_MOUNT_PROTECT_MS = 1600;
  const CFG_UNMOUNTM_MIN_MSGS_MIN = 8;
  const CFG_UNMOUNTM_MIN_MSGS_MAX = 240;
  const CFG_UNMOUNTM_MARGIN_MIN = 300;
  const CFG_UNMOUNTM_MARGIN_MAX = 8000;
  const CFG_UNMOUNTM_PASS_INTERVAL_MIN = 30;
  const CFG_UNMOUNTM_PASS_INTERVAL_MAX = 3000;
  const CFG_UNMOUNTM_INTERVAL_MIN = 3000;
  const CFG_UNMOUNTM_INTERVAL_MAX = 120000;
  const CFG_UNMOUNTM_MOUNT_PROTECT_MIN = 300;
  const CFG_UNMOUNTM_MOUNT_PROTECT_MAX = 8000;
  const CFG_UNMOUNTM_UID_ALIAS_MAX = 4000;
  const CFG_UNMOUNTM_DIAG_STEPS_MAX = 120;
  const CFG_UNMOUNTM_RESTORE_MODES = Object.freeze(['scroll', 'click', 'both']);

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

    // uid → shared turn-record (ONLY while unmounted)
    unmountMap: new Map(),
    uidAliasToPrimary: new Map(),

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
    commandBarBindTimer: 0,
    commandBarBound: false,
    commandBarApi: null,

    // waiters: uid -> Set<fn>
    remountWaiters: new Map(),

    // uid -> untilMs (protect from immediate re-unmount after a mount request)
    protectUntil: new Map(),
    clickRestoreViewportToken: 0,
  };

  const S = VAULT.state;

  /* ───────────────────────────── 3.1) Runtime Config (persisted) ───────────────────────────── */

  function UTIL_UM_readJSON(key, fallback) {
    try {
      const raw = W.localStorage?.getItem?.(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function UTIL_UM_writeJSON(key, obj) {
    try {
      W.localStorage?.setItem?.(key, JSON.stringify(obj || {}));
      return true;
    } catch (_) {
      return false;
    }
  }

  function UTIL_UM_toInt(v, fallback) {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function UTIL_UM_clampInt(v, min, max, fallback) {
    const n = UTIL_UM_toInt(v, fallback);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function UTIL_UM_normalizeRestoreMode(v, fallback = CFG_UNMOUNTM_DEFAULT_RESTORE_MODE) {
    const mode = String(v || '').trim().toLowerCase();
    return CFG_UNMOUNTM_RESTORE_MODES.includes(mode) ? mode : fallback;
  }

  function CFG_UM_normalize(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    return {
      enabled: src.enabled !== false,
      minMsgsForUnmount: UTIL_UM_clampInt(src.minMsgsForUnmount, CFG_UNMOUNTM_MIN_MSGS_MIN, CFG_UNMOUNTM_MIN_MSGS_MAX, CFG_UNMOUNTM_DEFAULT_MIN_MSGS_FOR_UNMOUNT),
      unmountMarginPx: UTIL_UM_clampInt(src.unmountMarginPx, CFG_UNMOUNTM_MARGIN_MIN, CFG_UNMOUNTM_MARGIN_MAX, CFG_UNMOUNTM_DEFAULT_UNMOUNT_MARGIN_PX),
      restoreMode: UTIL_UM_normalizeRestoreMode(src.restoreMode, CFG_UNMOUNTM_DEFAULT_RESTORE_MODE),
      passMinIntervalMs: UTIL_UM_clampInt(src.passMinIntervalMs, CFG_UNMOUNTM_PASS_INTERVAL_MIN, CFG_UNMOUNTM_PASS_INTERVAL_MAX, CFG_UNMOUNTM_DEFAULT_PASS_MIN_INTERVAL_MS),
      intervalMs: UTIL_UM_clampInt(src.intervalMs, CFG_UNMOUNTM_INTERVAL_MIN, CFG_UNMOUNTM_INTERVAL_MAX, CFG_UNMOUNTM_DEFAULT_INTERVAL_MS),
      mountProtectMs: UTIL_UM_clampInt(src.mountProtectMs, CFG_UNMOUNTM_MOUNT_PROTECT_MIN, CFG_UNMOUNTM_MOUNT_PROTECT_MAX, CFG_UNMOUNTM_DEFAULT_MOUNT_PROTECT_MS),
      keepQuoteCache: src.keepQuoteCache !== false,
      keepRevisionMeta: src.keepRevisionMeta !== false,
    };
  }

  VAULT.cfg = CFG_UM_normalize({
    enabled: CFG_UNMOUNTM_DEFAULT_ENABLED,
    minMsgsForUnmount: CFG_UNMOUNTM_DEFAULT_MIN_MSGS_FOR_UNMOUNT,
    unmountMarginPx: CFG_UNMOUNTM_DEFAULT_UNMOUNT_MARGIN_PX,
    restoreMode: CFG_UNMOUNTM_DEFAULT_RESTORE_MODE,
    passMinIntervalMs: CFG_UNMOUNTM_DEFAULT_PASS_MIN_INTERVAL_MS,
    intervalMs: CFG_UNMOUNTM_DEFAULT_INTERVAL_MS,
    mountProtectMs: CFG_UNMOUNTM_DEFAULT_MOUNT_PROTECT_MS,
    keepQuoteCache: true,
    keepRevisionMeta: true,
    ...(UTIL_UM_readJSON(KEY_UNMOUNTM_CFG_V1, {}) || {}),
    ...(VAULT.cfg || {}),
  });
  const C = VAULT.cfg;

  function CFG_UM_save() {
    UTIL_UM_writeJSON(KEY_UNMOUNTM_CFG_V1, C);
  }

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
  opacity: 0.78;
  font-style: italic;
  pointer-events: auto;
  user-select: none;
  cursor: pointer;
  overflow-anchor: none;
  transition: background .16s ease, border-color .16s ease, opacity .16s ease, transform .16s ease;
}
[data-${ATTR_UNMOUNTM_CGXUI_OWNER}="${SkID}"].cgxui-${SkID}-ph:hover{
  opacity: 0.96;
  background: rgba(255,255,255,0.035);
  border-color: rgba(148,163,184,0.9);
  transform: translateY(-1px);
}
[data-${ATTR_UNMOUNTM_CGXUI_OWNER}="${SkID}"].cgxui-${SkID}-ph[data-restore-mode="scroll"]{
  cursor: default;
}

/* 🔒 Hidden cache of inline highlights (for Panel inventory consistency) */
[data-${ATTR_UNMOUNTM_CGXUI_OWNER}="${SkID}"].cgxui-${SkID}-hl-cache{
  display: none !important;
}
[data-${ATTR_UNMOUNTM_CGXUI_OWNER}="${SkID}"].cgxui-${SkID}-quote-cache{
  display: none !important;
}
[data-${ATTR_UNMOUNTM_CGXUI_OWNER}="${SkID}"].cgxui-${SkID}-rev-cache{
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

  function CORE_UM_getTurnNo(el) {
    return String(el?.dataset?.[ATTR_UNMOUNTM_H2O_NUM] || '').trim();
  }

  function CORE_UM_buildTurnGroups(msgs) {
    const out = [];
    let current = null;

    const pushCurrent = () => {
      if (!current || !current.items.length) return;

      const questionItem = current.items.find((item) => item.role === STR_UNMOUNTM_ROLE_Q) || null;
      const assistantItem = current.items.find((item) => item.role === STR_UNMOUNTM_ROLE_A) || null;
      const primaryItem = questionItem || current.items[0] || null;
      if (!primaryItem) {
        current = null;
        return;
      }

      current.questionItem = questionItem;
      current.assistantItem = assistantItem;
      current.primaryItem = primaryItem;
      current.primaryUid = primaryItem.uid;
      current.primaryEl = primaryItem.el;
      current.uids = current.items.map((item) => item.uid).filter(Boolean);
      current.key = current.primaryUid || `turn:${current.num || out.length + 1}`;
      current.aliasIds = CORE_UM_collectGroupAliasIds(current);
      out.push(current);
      current = null;
    };

    for (const el of Array.isArray(msgs) ? msgs : []) {
      if (!el || !el.dataset) continue;
      UTIL_UM_migrateLegacyAttrs(el);

      const uid = UTIL_UM_normalizeId(el.dataset[ATTR_UNMOUNTM_H2O_UID] || '');
      if (!uid) continue;

      const num = CORE_UM_getTurnNo(el) || uid;
      const role = String(el.getAttribute('data-message-author-role') || '').trim().toLowerCase() || STR_UNMOUNTM_ROLE_A;
      const item = { el, uid, num, role };

      if (!current || current.num !== num) {
        pushCurrent();
        current = { num, items: [item] };
        continue;
      }

      current.items.push(item);
    }

    pushCurrent();
    return out;
  }

  function CORE_UM_getTurnGroupByUid(uid, msgs = null) {
    const id = UTIL_UM_normalizeId(uid);
    if (!id) return null;
    const primaryId = CORE_UM_resolvePrimaryUid(id) || id;

    const saved = S.unmountMap.get(primaryId) || S.unmountMap.get(id);
    if (saved) return saved;

    const sourceMsgs = Array.isArray(msgs) ? msgs : CORE_UM_getMessages();
    const groups = CORE_UM_buildTurnGroups(sourceMsgs);
    return groups.find((group) => {
      const aliasIds = Array.isArray(group.aliasIds) ? group.aliasIds : CORE_UM_collectGroupAliasIds(group);
      group.aliasIds = aliasIds;
      return aliasIds.includes(id) || aliasIds.includes(primaryId);
    }) || null;
  }

  function CORE_UM_getTurnGroupBounds(group) {
    if (!group || !Array.isArray(group.items) || !group.items.length) return null;

    let absTop = Number.POSITIVE_INFINITY;
    let absBottom = Number.NEGATIVE_INFINITY;
    let found = false;

    for (const item of group.items) {
      const el = item?.el;
      if (!el || !el.isConnected) continue;
      if (el.dataset?.[ATTR_UNMOUNTM_TURN_HIDDEN] === '1') continue;

      const rect = el.getBoundingClientRect();
      if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) continue;

      absTop = Math.min(absTop, rect.top + W.scrollY);
      absBottom = Math.max(absBottom, rect.bottom + W.scrollY);
      found = true;
    }

    if (!found) return null;
    return { absTop, absBottom };
  }

  function CORE_UM_isTurnGroupUnmounted(group) {
    return !!(group?.primaryEl?.dataset?.[ATTR_UNMOUNTM_H2O_UNMOUNTED] === '1');
  }

  function CORE_UM_markTurnProtected(group, until) {
    const ids = Array.isArray(group?.aliasIds) && group.aliasIds.length ? group.aliasIds : group?.uids;
    if (!Array.isArray(ids) || !ids.length) return 0;
    let count = 0;
    for (const uid of ids) {
      const id = UTIL_UM_normalizeId(uid);
      if (!id) continue;
      S.protectUntil.set(id, until);
      count += 1;
    }
    return count;
  }

  function CORE_UM_isTurnGroupProtected(group) {
    const ids = Array.isArray(group?.aliasIds) && group.aliasIds.length ? group.aliasIds : group?.uids;
    if (!Array.isArray(ids) || !ids.length) return false;
    let protectedAny = false;
    for (const uid of ids) {
      const id = UTIL_UM_normalizeId(uid);
      if (!id) continue;
      const until = S.protectUntil.get(id) || 0;
      const isProtected = !!(until && until > Date.now());
      if (until && !isProtected) S.protectUntil.delete(id);
      if (isProtected) protectedAny = true;
    }
    return protectedAny;
  }

  function CORE_UM_getCollapsedGroupCount() {
    const seen = new Set();
    for (const rec of S.unmountMap.values()) {
      const key = String(rec?.key || rec?.primaryUid || '');
      if (key) seen.add(key);
    }
    return seen.size;
  }

  function CORE_UM_isScrollRestoreEnabled() {
    return C.restoreMode === 'scroll' || C.restoreMode === 'both';
  }

  function CORE_UM_isClickRestoreEnabled() {
    return C.restoreMode === 'click' || C.restoreMode === 'both';
  }

  function CORE_UM_getRestoreModeLabel() {
    const mode = UTIL_UM_normalizeRestoreMode(C.restoreMode, CFG_UNMOUNTM_DEFAULT_RESTORE_MODE);
    if (mode === 'scroll') return 'scroll';
    if (mode === 'click') return 'click';
    return 'scroll/click';
  }

  /** @helper Normalize ids (strip conversation-turn-). */
  function UTIL_UM_normalizeId(id) {
    return String(id || '').replace(/^conversation-turn-/, '').trim();
  }

  function CORE_UM_addAliasId(set, raw, opts = {}) {
    if (!(set instanceof Set)) return;
    const id = UTIL_UM_normalizeId(raw);
    if (!id) return;

    set.add(id);

    if (id.startsWith('turn:a:')) {
      const bare = UTIL_UM_normalizeId(id.slice(7));
      if (bare) {
        set.add(bare);
        set.add(`turn:${bare}`);
      }
      return;
    }

    if (id.startsWith('turn:')) {
      const bare = UTIL_UM_normalizeId(id.slice(5));
      if (bare) set.add(bare);
      return;
    }

    if (opts.turnVariant) set.add(`turn:${id}`);
    if (opts.assistantTurnVariant) set.add(`turn:a:${id}`);
  }

  function CORE_UM_collectItemAliasIds(item) {
    const out = new Set();
    if (!item?.el) return out;

    const isAssistant = item.role === STR_UNMOUNTM_ROLE_A;
    CORE_UM_addAliasId(out, item.uid, { turnVariant: true, assistantTurnVariant: isAssistant });

    const attrCandidates = [
      'data-message-id',
      'data-turn-id',
      'data-cgxui-id',
      'data-h2o-ans-id',
      'data-h2o-core-id',
    ];
    for (const attrName of attrCandidates) {
      CORE_UM_addAliasId(out, item.el.getAttribute?.(attrName) || '', {
        turnVariant: attrName !== 'data-turn-id',
        assistantTurnVariant: isAssistant && attrName !== 'data-turn-id',
      });
    }

    const dsCandidates = [
      item.el?.dataset?.messageId,
      item.el?.dataset?.turnId,
      item.el?.dataset?.cgxuiId,
      item.el?.dataset?.h2oAnsId,
      item.el?.dataset?.h2oCoreId,
    ];
    for (const raw of dsCandidates) {
      CORE_UM_addAliasId(out, raw, { turnVariant: true, assistantTurnVariant: isAssistant });
    }

    const turnApi = W.H2O?.turn || null;
    let localTurnIndex = 0;
    try {
      localTurnIndex = isAssistant
        ? Number(turnApi?.getTurnIndexByAEl?.(item.el) || 0)
        : Number(turnApi?.getTurnIndexByQEl?.(item.el) || 0);
    } catch (_) {
      localTurnIndex = 0;
    }

    if (localTurnIndex > 0) {
      CORE_UM_addAliasId(out, turnApi?.getTurnIdByTurnIndex?.(localTurnIndex) || '');
      const primaryAId =
        turnApi?.getPrimaryAIdByTurnIndex?.(localTurnIndex)
        || (isAssistant ? turnApi?.getPrimaryAIdByAId?.(item.uid || '') : '');
      CORE_UM_addAliasId(out, primaryAId, { turnVariant: true, assistantTurnVariant: true });
    }

    return out;
  }

  function CORE_UM_collectGroupAliasIds(group) {
    const out = new Set();
    if (!group) return [];

    const key = UTIL_UM_normalizeId(group.key || '');
    if (key) out.add(key);

    CORE_UM_addAliasId(out, group.primaryUid, {
      turnVariant: true,
      assistantTurnVariant: !!group?.assistantItem?.uid,
    });
    CORE_UM_addAliasId(out, group?.questionItem?.uid, { turnVariant: true });
    CORE_UM_addAliasId(out, group?.assistantItem?.uid, { turnVariant: true, assistantTurnVariant: true });

    for (const uid of group.uids || []) {
      CORE_UM_addAliasId(out, uid, { turnVariant: true });
    }

    for (const item of group.items || []) {
      const itemAliases = Array.from(CORE_UM_collectItemAliasIds(item));
      item.aliasIds = itemAliases;
      for (const alias of itemAliases) out.add(alias);
    }

    return Array.from(out);
  }

  function CORE_UM_getTurnRuntimeApi() {
    return W?.H2O?.turnRuntime || null;
  }

  function CORE_UM_getSharedTurnRecordForGroup(group) {
    const api = CORE_UM_getTurnRuntimeApi();
    if (!api) return null;

    const aliasIds = Array.isArray(group?.aliasIds) && group.aliasIds.length
      ? group.aliasIds
      : CORE_UM_collectGroupAliasIds(group);

    for (const rawId of aliasIds) {
      const id = UTIL_UM_normalizeId(rawId);
      if (!id) continue;
      try {
        const record =
          api.getTurnRecordByTurnId?.(id)
          || api.getTurnRecordByAId?.(id)
          || api.getTurnRecordByQId?.(id)
          || null;
        if (record?.turnId) return record;
      } catch (_) {}
    }

    return null;
  }

  function CORE_UM_patchSharedMountStateForGroup(group, partialMountState) {
    const api = CORE_UM_getTurnRuntimeApi();
    if (!api || typeof api.patchTurnMountState !== 'function') return null;
    const record = CORE_UM_getSharedTurnRecordForGroup(group);
    if (!record?.turnId) return null;
    try {
      return api.patchTurnMountState(record.turnId, partialMountState || {}, { owner: 'unmount' }) || null;
    } catch (_) {
      return null;
    }
  }

  function CORE_UM_trimAliasMap() {
    while (S.uidAliasToPrimary.size > CFG_UNMOUNTM_UID_ALIAS_MAX) {
      const oldest = S.uidAliasToPrimary.keys().next().value;
      if (!oldest) break;
      S.uidAliasToPrimary.delete(oldest);
    }
  }

  function CORE_UM_registerGroupAliases(group) {
    if (!group) return 0;
    const primary = UTIL_UM_normalizeId(group.primaryUid || group.key || '');
    if (!primary) return 0;

    const aliasIds = Array.isArray(group.aliasIds) && group.aliasIds.length
      ? group.aliasIds
      : CORE_UM_collectGroupAliasIds(group);
    const seen = new Set();
    let count = 0;

    group.aliasIds = Array.from(aliasIds || []).map(UTIL_UM_normalizeId).filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    for (const alias of group.aliasIds) {
      S.uidAliasToPrimary.delete(alias);
      S.uidAliasToPrimary.set(alias, primary);
      count += 1;
    }

    CORE_UM_trimAliasMap();
    return count;
  }

  function CORE_UM_unregisterGroupAliases(group) {
    if (!group || !Array.isArray(group.aliasIds) || !group.aliasIds.length) return 0;
    const primary = UTIL_UM_normalizeId(group.primaryUid || group.key || '');
    let count = 0;
    for (const raw of group.aliasIds) {
      const alias = UTIL_UM_normalizeId(raw);
      if (!alias) continue;
      if (primary && S.uidAliasToPrimary.get(alias) !== primary) continue;
      if (S.uidAliasToPrimary.delete(alias)) count += 1;
    }
    return count;
  }

  function CORE_UM_resolvePrimaryUid(anyId) {
    const id = UTIL_UM_normalizeId(anyId);
    if (!id) return '';
    if (S.unmountMap.has(id)) return id;
    return UTIL_UM_normalizeId(S.uidAliasToPrimary.get(id) || '') || id;
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

  function UTIL_UM_parseSlashCounter(text) {
    const m = String(text || '').trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m) return null;
    const cur = Number.parseInt(m[1], 10);
    const total = Number.parseInt(m[2], 10);
    if (!Number.isFinite(cur) || !Number.isFinite(total) || total <= 1) return null;
    return { cur, total };
  }

  function DOM_UM_findRevisionInfoNearMessage(msgEl, role) {
    if (!msgEl) return null;

    const turn =
      msgEl.closest?.(SEL_UNMOUNTM_CONV_TURN) ||
      msgEl.closest?.(SEL_UNMOUNTM_TURN_MSG_GROUP) ||
      msgEl.parentElement;

    if (!turn) return null;

    const baseRect = msgEl.getBoundingClientRect();
    const candidates = Array.from(turn.querySelectorAll(SEL_UNMOUNTM_TABULAR_NUMS))
      .map((chip) => ({ chip, rect: chip.getBoundingClientRect(), info: UTIL_UM_parseSlashCounter(chip.textContent || '') }))
      .filter((x) => x.info);
    if (!candidates.length) return null;

    const rangeMin = (role === STR_UNMOUNTM_ROLE_Q) ? -60 : -40;
    const rangeMax = 260;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const c of candidates) {
      const dy = c.rect.top - baseRect.bottom;
      if (dy < rangeMin || dy > rangeMax) continue;
      const score = Math.abs(dy);
      if (score < bestScore) {
        best = c;
        bestScore = score;
      }
    }
    return best ? best.info : null;
  }

  function DOM_UM_storeRevisionMeta(el, role) {
    if (!C.keepRevisionMeta) return null;
    const info = DOM_UM_findRevisionInfoNearMessage(el, role);
    if (!info) return null;

    if (role === STR_UNMOUNTM_ROLE_Q) {
      el.dataset[ATTR_UNMOUNTM_QREV_CUR] = String(info.cur);
      el.dataset[ATTR_UNMOUNTM_QREV_TOTAL] = String(info.total);
    } else if (role === STR_UNMOUNTM_ROLE_A) {
      el.dataset[ATTR_UNMOUNTM_AREV_CUR] = String(info.cur);
      el.dataset[ATTR_UNMOUNTM_AREV_TOTAL] = String(info.total);
    }
    return info;
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

  function CORE_UM_getPaginationTurnOffset(H) {
    const api = W.H2O_Pagination;
    if (!api || typeof api.getPageInfo !== 'function') return 0;

    let info = null;
    try { info = api.getPageInfo(); } catch (_) { info = null; }
    if (!info || info.enabled === false) return 0;

    const totalCanonical = Math.max(
      Number(info?.totalTurns || 0),
      Number(info?.totalAnswers || 0),
      Number(info?.answerRange?.total || 0),
      Number(info?.bufferedAnswerRange?.total || 0),
    );
    const localTurns = Number(H?.turn?.total?.() || 0);
    if (!Number.isFinite(totalCanonical) || totalCanonical <= 0) return 0;
    if (!Number.isFinite(localTurns) || localTurns <= 0 || localTurns >= totalCanonical) return 0;

    const start = Math.max(
      0,
      Number(info?.bufferedAnswerRange?.start || info?.answerRange?.start || 0) || 0,
    );
    return start > 1 ? (start - 1) : 0;
  }

  /** @helper Core turn getter (supports common Core shape). */
  function CORE_UM_getCoreTurnNo(H, el, paginationOffset = 0) {
    if (!H || !el) return 0;
    const role = el.getAttribute('data-message-author-role');
    const localTurnNo =
      role === STR_UNMOUNTM_ROLE_A
        ? (H?.turn?.getTurnIndexByAEl?.(el) || 0)
        : role === STR_UNMOUNTM_ROLE_Q
          ? (H?.turn?.getTurnIndexByQEl?.(el) || 0)
          : 0;
    if (!localTurnNo) return 0;
    return localTurnNo + Math.max(0, Number(paginationOffset || 0) || 0);
  }

  function DOM_UM_getRestoreHintText() {
    if (CORE_UM_isScrollRestoreEnabled() && CORE_UM_isClickRestoreEnabled()) return 'Scroll closer or click to restore.';
    if (CORE_UM_isScrollRestoreEnabled()) return 'Scroll closer to restore.';
    if (CORE_UM_isClickRestoreEnabled()) return 'Click to restore.';
    return 'Restore is disabled.';
  }

  function DOM_UM_getPlaceholderTitle() {
    if (CORE_UM_isClickRestoreEnabled()) return 'Click to restore this turn';
    if (CORE_UM_isScrollRestoreEnabled()) return 'Scroll closer to restore this turn';
    return 'Restore is disabled for this turn';
  }

  function DOM_UM_buildPlaceholderLabel(num) {
    return `Q&A #${String(num || '?').trim() || '?'} collapsed for performance. ${DOM_UM_getRestoreHintText()}`;
  }

  function DOM_UM_refreshUnmountedPlaceholder(el) {
    if (!el || el.dataset?.[ATTR_UNMOUNTM_H2O_UNMOUNTED] !== '1') return false;
    const body = DOM_UM_getMessageBody(el);
    if (!body) return false;

    const ph = body.querySelector(SEL_UNMOUNTM_PH);
    if (!ph) return false;

    const num = String(el.dataset?.[ATTR_UNMOUNTM_H2O_NUM] || ph.dataset.num || '?').trim() || '?';
    ph.dataset.num = String(num || '');
    ph.dataset.restoreMode = UTIL_UM_normalizeRestoreMode(C.restoreMode, CFG_UNMOUNTM_DEFAULT_RESTORE_MODE);
    ph.title = DOM_UM_getPlaceholderTitle();
    ph.textContent = DOM_UM_buildPlaceholderLabel(num);
    return true;
  }

  /**
   * Assign shared numbering + stable ids:
   * ✅ BEST: Core turn-index
   * ✅ FALLBACK: assistant running count, pair preceding question to same number
   */
  function CORE_UM_ensureMessageIds(msgs) {
    const H = W.H2O;
    const paginationOffset = CORE_UM_getPaginationTurnOffset(H);
    const hasCore = !!(H && (H.turn?.getTurnIndexByAEl || H.turn?.getTurnIndexByQEl));

    if (hasCore) {
      for (const el of msgs) {
        UTIL_UM_migrateLegacyAttrs(el);
        const uid = CORE_UM_getCoreMsgId(H, el) || '';
        const turnNo = CORE_UM_getCoreTurnNo(H, el, paginationOffset) || 0;
        if (uid) el.dataset[ATTR_UNMOUNTM_H2O_UID] = uid;
        if (turnNo) {
          el.dataset[ATTR_UNMOUNTM_H2O_NUM] = String(turnNo);
          DOM_UM_refreshUnmountedPlaceholder(el);
        }
      }
      return;
    }

    let answerIndex = Math.max(0, Number(paginationOffset || 0) || 0);
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
        DOM_UM_refreshUnmountedPlaceholder(el);

        if (!el.dataset[ATTR_UNMOUNTM_H2O_UID]) el.dataset[ATTR_UNMOUNTM_H2O_UID] = `${STR_UNMOUNTM_A_PREFIX}${num}`;

        if (pendingQuestion) {
          pendingQuestion.dataset[ATTR_UNMOUNTM_H2O_NUM] = num;
          DOM_UM_refreshUnmountedPlaceholder(pendingQuestion);

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
      DOM_UM_refreshUnmountedPlaceholder(pendingQuestion);

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

  function CORE_UM_emitMiniMapPhase(reason, extra = null) {
    const payload = {
      source: STR_UNMOUNTM_SRC_UNMOUNT,
      reason: String(reason || 'unmount'),
      ts: Date.now(),
      ...(extra && typeof extra === 'object' ? extra : {}),
    };
    UTIL_UM_emitDom(EV_UNMOUNTM_MINIMAP_PHASE_EVT, payload);
    UTIL_UM_emitDom(EV_UNMOUNTM_MINIMAP_PHASE, payload);
  }

  function CORE_UM_requestMiniMapSync(reason, extra = null) {
    const tag = `unmount:${String(reason || 'pass')}`;

    try { W.H2O_MM_coreScheduleRebuild?.(tag); } catch (_) {}
    try { W.H2O?.MM?.mnmp?.api?.core?.scheduleRebuild?.(tag); } catch (_) {}
    try { W.H2O?.MM?.mnmp?.api?.engine?.scheduleRebuild?.(tag); } catch (_) {}

    CORE_UM_emitMiniMapPhase(tag, extra);
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

    const waiterIds = new Set([
      UTIL_UM_normalizeId(uid),
      CORE_UM_resolvePrimaryUid(uid),
    ]);
    for (const waiterId of waiterIds) {
      const set = waiterId ? S.remountWaiters.get(waiterId) : null;
      if (!set || !set.size) continue;
      set.forEach(fn => { try { fn(payload); } catch (_) {} });
      set.clear();
    }
  }

  /** @core Promise helper: wait until a specific uid is remounted. */
  function API_UM_waitUntilRemounted(uid, timeoutMs = CFG_UNMOUNTM_WAITER_TIMEOUT_MS) {
    const id = UTIL_UM_normalizeId(uid);
    if (!id) return Promise.resolve(null);
    const primaryId = CORE_UM_resolvePrimaryUid(id) || id;

    return new Promise(resolve => {
      const t0 = performance.now();

      const tick = () => {
        const el = CORE_UM_findMessageByUid(primaryId);
        const isUnmounted = !!(el && el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED] === '1');
        if (el && !isUnmounted) return resolve({ id: primaryId, ok: true, via: 'already' });
        if (performance.now() - t0 > timeoutMs) return resolve({ id: primaryId, ok: false, via: 'timeout' });
        requestAnimationFrame(tick);
      };

      const waiterIds = new Set([id, primaryId]);
      for (const waiterId of waiterIds) {
        if (!waiterId) continue;
        if (!S.remountWaiters.has(waiterId)) S.remountWaiters.set(waiterId, new Set());
        S.remountWaiters.get(waiterId).add(() => resolve({ id: primaryId, ok: true, via: 'event' }));
      }

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

  function DOM_UM_buildQuoteCacheHTML(qboxes) {
    if (!C.keepQuoteCache) return '';
    if (!qboxes || !qboxes.length) return '';

    const wrap = document.createElement('div');
    wrap.className = SEL_UNMOUNTM_QUOTE_CACHE.slice(1);
    wrap.setAttribute(`data-${ATTR_UNMOUNTM_CGXUI_OWNER}`, SkID);

    qboxes.forEach((q) => {
      try { wrap.appendChild(q.cloneNode(true)); } catch (_) {}
    });
    return wrap.outerHTML || '';
  }

  function DOM_UM_buildRevisionCacheHTML(info) {
    if (!C.keepRevisionMeta || !info) return '';
    const wrap = document.createElement('div');
    wrap.className = SEL_UNMOUNTM_REV_CACHE.slice(1);
    wrap.setAttribute(`data-${ATTR_UNMOUNTM_CGXUI_OWNER}`, SkID);

    const chip = document.createElement('span');
    chip.className = SEL_UNMOUNTM_TABULAR_NUMS.slice(1);
    chip.textContent = `${info.cur}/${info.total}`;
    wrap.appendChild(chip);
    return wrap.outerHTML || '';
  }

  function DOM_UM_buildTurnUnmountCaches(group) {
    const marks = [];
    const qboxes = [];
    const revCacheParts = [];
    const answerIdsWithMarks = new Set();

    for (const item of group?.items || []) {
      const body = DOM_UM_getMessageBody(item?.el);
      if (!body) continue;

      const itemMarks = Array.from(body.querySelectorAll(SEL_UNMOUNTM_MARK_HL));
      if (itemMarks.length && item.role === STR_UNMOUNTM_ROLE_A && item.uid) {
        answerIdsWithMarks.add(item.uid);
      }
      marks.push(...itemMarks);

      if (item.role === STR_UNMOUNTM_ROLE_Q) {
        qboxes.push(...Array.from(body.querySelectorAll(SEL_UNMOUNTM_QUOTE_BOX)));
      }

      const revInfo = DOM_UM_storeRevisionMeta(item.el, item.role);
      const revHTML = DOM_UM_buildRevisionCacheHTML(revInfo);
      if (revHTML) revCacheParts.push(revHTML);
    }

    return {
      anchorHTML: DOM_UM_buildAnchorHTMLFromMarks(marks),
      cacheHTML: DOM_UM_buildHiddenCacheHTMLFromMarks(marks),
      quoteCacheHTML: DOM_UM_buildQuoteCacheHTML(qboxes),
      revCacheHTML: revCacheParts.join(''),
      answerIdsWithMarks: Array.from(answerIdsWithMarks),
    };
  }

  /** @critical Soft-unmount one turn group. */
  function CORE_UM_softUnmount(group, why = STR_UNMOUNTM_UNMOUNT_REASON) {
    if (!group?.primaryEl || CORE_UM_isTurnGroupUnmounted(group)) return;

    const primaryBody = DOM_UM_getMessageBody(group.primaryEl);
    if (!primaryBody) return;

    const saved = {
      key: String(group.key || group.primaryUid || ''),
      num: String(group.num || '?'),
      primaryUid: String(group.primaryUid || ''),
      primaryEl: group.primaryEl,
      uids: Array.from(group.uids || []),
      aliasIds: Array.from(group.aliasIds || []),
      items: [],
      answerIdsWithMarks: [],
    };

    const cacheBits = DOM_UM_buildTurnUnmountCaches(group);
    saved.answerIdsWithMarks = Array.from(cacheBits.answerIdsWithMarks || []);

    for (const item of group.items) {
      const el = item?.el;
      const body = DOM_UM_getMessageBody(el);
      if (!el || !body) continue;

      const frag = document.createDocumentFragment();
      while (body.firstChild) frag.appendChild(body.firstChild);

      saved.items.push({
        uid: String(item.uid || ''),
        role: String(item.role || ''),
        el,
        frag,
        displayBefore: String(el.style.display || ''),
      });

      el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED] = '1';
      delete el.dataset[ATTR_UNMOUNTM_TURN_HIDDEN];
    }

    if (!saved.items.length) return;

    const ph = document.createElement('div');
    ph.className = SEL_UNMOUNTM_PH.slice(1);
    ph.classList.add(`cgxui-${SkID}-ph`);
    ph.classList.add('cgxui-unmounted-placeholder');
    ph.setAttribute(`data-${ATTR_UNMOUNTM_CGXUI_OWNER}`, SkID);
    ph.dataset.uid = saved.primaryUid;
    ph.dataset.num = saved.num;
    ph.dataset.restoreMode = UTIL_UM_normalizeRestoreMode(C.restoreMode, CFG_UNMOUNTM_DEFAULT_RESTORE_MODE);
    ph.title = DOM_UM_getPlaceholderTitle();
    ph.textContent = DOM_UM_buildPlaceholderLabel(saved.num);

    const tmp = document.createElement('div');
    tmp.innerHTML = `${cacheBits.anchorHTML}${cacheBits.quoteCacheHTML}${cacheBits.revCacheHTML}${ph.outerHTML}${cacheBits.cacheHTML}`;
    primaryBody.replaceChildren(...Array.from(tmp.childNodes));

    for (const entry of saved.items) {
      if (entry.el === group.primaryEl) continue;
      const body = DOM_UM_getMessageBody(entry.el);
      if (body) body.replaceChildren();
      entry.el.dataset[ATTR_UNMOUNTM_TURN_HIDDEN] = '1';
      entry.el.style.display = 'none';
    }

    for (const id of saved.uids) {
      if (!id) continue;
      S.unmountMap.set(id, saved);
    }
    const primaryKey = UTIL_UM_normalizeId(saved.primaryUid || saved.key || '');
    if (primaryKey) S.unmountMap.set(primaryKey, saved);
    CORE_UM_registerGroupAliases(saved);

    for (const answerId of saved.answerIdsWithMarks) {
      CORE_UM_emitInlineChanged({ answerId, reason: STR_UNMOUNTM_UNMOUNT_REASON });
    }

    CORE_UM_patchSharedMountStateForGroup(saved, {
      mountState: 'placeholder',
      isMounted: false,
      placeholderEl: ph,
      lastUnmountReason: String(why || STR_UNMOUNTM_UNMOUNT_REASON),
    });
  }

  /** @critical Soft-remount one turn group. */
  function CORE_UM_softRemount(uid, why = STR_UNMOUNTM_RESTORE) {
    const id = UTIL_UM_normalizeId(uid);
    const primaryId = CORE_UM_resolvePrimaryUid(id) || id;
    const saved = S.unmountMap.get(primaryId) || S.unmountMap.get(id);
    if (!saved) {
      const el = CORE_UM_findMessageByUid(primaryId);
      if (el) {
        delete el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED];
        delete el.dataset[ATTR_UNMOUNTM_TURN_HIDDEN];
        el.style.display = '';
      }
      return;
    }

    for (const entry of saved.items || []) {
      const el = entry?.el;
      if (!el) continue;

      if (el.dataset?.[ATTR_UNMOUNTM_TURN_HIDDEN] === '1') {
        delete el.dataset[ATTR_UNMOUNTM_TURN_HIDDEN];
      }
      el.style.display = String(entry.displayBefore || '');

      const body = DOM_UM_getMessageBody(el);
      if (!body) {
        delete el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED];
        continue;
      }

      body.replaceChildren();
      if (entry.frag) body.appendChild(entry.frag);
      delete el.dataset[ATTR_UNMOUNTM_H2O_UNMOUNTED];

      let hasMarks = !!body.querySelector(SEL_UNMOUNTM_MARK_HL);
      if (entry.role === STR_UNMOUNTM_ROLE_A) {
        const hadRestoringUid = Object.prototype.hasOwnProperty.call(W, 'H2O_UM_RESTORING_UID');
        const prevRestoringUid = W.H2O_UM_RESTORING_UID;
        try {
          if (entry.uid) W.H2O_UM_RESTORING_UID = entry.uid;
          W.restoreInlineHighlights?.(entry.uid || el);
        } catch (_) {
        } finally {
          try {
            if (hadRestoringUid) W.H2O_UM_RESTORING_UID = prevRestoringUid;
            else delete W.H2O_UM_RESTORING_UID;
          } catch (_) {}
        }
        hasMarks = !!body.querySelector(SEL_UNMOUNTM_MARK_HL);
      }

      if (hasMarks && entry.role === STR_UNMOUNTM_ROLE_A && entry.uid) {
        CORE_UM_emitInlineChanged({ answerId: entry.uid, reason: STR_UNMOUNTM_REMOUNT_REASON });
      }
      if (entry.uid) {
        CORE_UM_emitMessageRemounted(entry.uid, STR_UNMOUNTM_RESTORE);
        try { W.syncMiniMapDot?.(entry.uid); } catch (_) {}
      }
    }

    const deleteIds = new Set([
      UTIL_UM_normalizeId(saved.primaryUid || ''),
      UTIL_UM_normalizeId(saved.key || ''),
      ...Array.from(saved.uids || []).map(UTIL_UM_normalizeId),
      ...Array.from(saved.aliasIds || []).map(UTIL_UM_normalizeId),
    ]);
    for (const groupUid of deleteIds) {
      if (!groupUid) continue;
      S.unmountMap.delete(groupUid);
    }
    CORE_UM_unregisterGroupAliases(saved);
    CORE_UM_patchSharedMountStateForGroup(saved, {
      mountState: 'mounted',
      isMounted: true,
      placeholderEl: null,
      lastMountReason: String(why || STR_UNMOUNTM_RESTORE),
    });
  }

  /* ───────────────────────────── 10) Pass Scheduler ───────────────────────────── */

  function CORE_UM_scheduleUpdate(reason) {
    if (S.scheduled) return;
    S.scheduled = true;

    const schedule = H2O.runtime?.schedule || null;
    const run = () => {
      S.scheduled = false;

      const now = performance.now();
      if (now - S.lastPassAt < C.passMinIntervalMs) return;
      S.lastPassAt = now;

      CORE_UM_runUnmountPass(reason || '');
    };

    if (schedule) {
      schedule.rafOnce('unmount:update', run);
      return;
    }
    requestAnimationFrame(run);
  }

  function CORE_UM_restartIntervalTimer() {
    if (S.intervalT) {
      try { clearInterval(S.intervalT); } catch (_) {}
      S.intervalT = 0;
    }
    if (!S.booted) return;
    W[KEY_UNMOUNTM_GUARD_INTERVAL] = 1;
    S.intervalT = W.setInterval(() => CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_INTERVAL), C.intervalMs);
  }

  function CORE_UM_findMessageByUid(uid) {
    const msgs = CORE_UM_getMessages();
    const id = UTIL_UM_normalizeId(uid);
    if (!id) return null;
    const direct = msgs.find(el => el?.dataset?.[ATTR_UNMOUNTM_H2O_UID] === id) || null;
    if (direct) return direct;

    const group = CORE_UM_getTurnGroupByUid(id, msgs);
    if (!group) return null;
    if (group.assistantItem?.el?.isConnected) return group.assistantItem.el;
    if (group.primaryEl?.isConnected) return group.primaryEl;
    for (const item of group.items || []) {
      if (item?.el?.isConnected) return item.el;
    }
    return null;
  }

  function CORE_UM_findPrimaryMessageByUid(uid) {
    const id = UTIL_UM_normalizeId(uid);
    if (!id) return null;
    const group = CORE_UM_getTurnGroupByUid(id, CORE_UM_getMessages());
    if (group?.primaryEl?.isConnected) return group.primaryEl;
    return CORE_UM_findMessageByUid(id);
  }

  function CORE_UM_lockViewportToRestoredTurn(uid, targetTop) {
    const id = UTIL_UM_normalizeId(uid);
    if (!id || !Number.isFinite(targetTop)) return;

    const token = Date.now() + Math.random();
    S.clickRestoreViewportToken = token;

    const align = () => {
      if (!S.booted) return false;
      if (S.clickRestoreViewportToken !== token) return false;

      const target = CORE_UM_findPrimaryMessageByUid(id);
      if (!target || !target.isConnected) return false;

      const rect = target.getBoundingClientRect();
      const delta = rect.top - targetTop;
      if (!Number.isFinite(delta) || Math.abs(delta) < 1 || Math.abs(delta) > 12000) return true;

      try { W.scrollBy({ top: delta, left: 0, behavior: 'auto' }); } catch (_) { W.scrollBy(0, delta); }
      return true;
    };

    API_UM_waitUntilRemounted(id, Math.max(1200, CFG_UNMOUNTM_WAITER_TIMEOUT_MS)).then((result) => {
      if (!result?.ok) {
        if (S.clickRestoreViewportToken === token) S.clickRestoreViewportToken = 0;
        return;
      }

      const settle = (attempt = 0) => {
        if (!S.booted) return;
        if (S.clickRestoreViewportToken !== token) return;

        align();

        if (attempt >= 3) {
          if (S.clickRestoreViewportToken === token) S.clickRestoreViewportToken = 0;
          return;
        }

        if (attempt < 2) {
          requestAnimationFrame(() => settle(attempt + 1));
          return;
        }

        W.setTimeout(() => settle(attempt + 1), 90);
      };

      requestAnimationFrame(() => settle(0));
    }).catch(() => {
      if (S.clickRestoreViewportToken === token) S.clickRestoreViewportToken = 0;
    });
  }

  function API_UM_requestMountByUid(uid, why) {
    const id = UTIL_UM_normalizeId(uid);
    if (!id) return false;
    const primaryId = CORE_UM_resolvePrimaryUid(id) || id;
    const until = Date.now() + C.mountProtectMs;
    const msgs = CORE_UM_getMessages();
    const group = CORE_UM_getTurnGroupByUid(primaryId, msgs) || CORE_UM_getTurnGroupByUid(id, msgs);
    if (group) CORE_UM_markTurnProtected(group, until);
    else {
      S.protectUntil.set(primaryId, until);
      if (primaryId !== id) S.protectUntil.set(id, until);
    }

    API_UM_forceRemountByUid(primaryId, why || STR_UNMOUNTM_MOUNT_REQUEST_REASON);
    CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_MOUNT_REQ);
    return true;
  }

  function API_UM_requestMountPairByUid(uid, why) {
    return API_UM_requestMountByUid(uid, why);
  }

  function UI_UM_handlePlaceholderClick(ev) {
    const ph = ev?.target?.closest?.(SEL_UNMOUNTM_PH);
    if (!ph) return;
    if (ph.getAttribute(`data-${ATTR_UNMOUNTM_CGXUI_OWNER}`) !== SkID) return;
    if (!CORE_UM_isClickRestoreEnabled()) return;

    const uid = UTIL_UM_normalizeId(ph.dataset.uid || '');
    if (!uid) return;
    const topBefore = ph.getBoundingClientRect().top;

    ev.preventDefault();
    ev.stopPropagation();

    API_UM_requestMountByUid(uid, 'placeholder:click');
    CORE_UM_lockViewportToRestoredTurn(uid, topBefore);
    CORE_UM_scheduleUpdate(STR_UNMOUNTM_REASON_MOUNT_REQ);
  }

  /** @core API: force remount by uid. */
  function API_UM_forceRemountByUid(uid, why) {
    const id = UTIL_UM_normalizeId(uid);
    if (!id) return false;
    const primaryId = CORE_UM_resolvePrimaryUid(id) || id;

    const saved = S.unmountMap.get(primaryId) || S.unmountMap.get(id);
    if (saved) {
      CORE_UM_softRemount(primaryId, why || STR_UNMOUNTM_FORCE);
      CORE_UM_requestMiniMapSync('force-remount', { id: primaryId, reason: String(why || STR_UNMOUNTM_FORCE) });
      return true;
    }
    return false;
  }

  function API_UM_remountAll(why) {
    if (!S.unmountMap?.size) return 0;

    const seen = new Set();
    let count = 0;
    for (const rec of S.unmountMap.values()) {
      const key = String(rec?.key || rec?.primaryUid || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      CORE_UM_softRemount(rec.primaryUid || key, why || STR_UNMOUNTM_RESTORE);
      count += 1;
    }

    if (count) {
      DIAG_UM_safe('remount:all', { count, why: String(why || '') });
      CORE_UM_requestMiniMapSync('remount-all', { count, reason: String(why || '') });
    }
    return count;
  }

  /** @critical Main pass: unmount/remount based on distance from viewport. */
  function CORE_UM_runUnmountPass(reason) {
    const msgs = CORE_UM_getMessages();
    if (!msgs.length) return;

    CORE_UM_ensureMessageIds(msgs);
    const groups = CORE_UM_buildTurnGroups(msgs);
    if (!groups.length) return;

    if (!C.enabled) {
      const restored = API_UM_remountAll('disabled');
      if (restored) CORE_UM_requestMiniMapSync('disabled', { restored, reason: String(reason || '') });
      return;
    }

    if (msgs.length < C.minMsgsForUnmount) {
      const restored = API_UM_remountAll('below-threshold');
      if (restored) CORE_UM_requestMiniMapSync('below-threshold', { restored, reason: String(reason || '') });
      return;
    }

    const vpTop = W.scrollY;
    const vpBottom = vpTop + W.innerHeight;

    const aboveLine = vpTop - C.unmountMarginPx;
    const belowLine = vpBottom + C.unmountMarginPx;
    let unmountedCount = 0;
    let remountedCount = 0;

    for (const group of groups) {
      const bounds = CORE_UM_getTurnGroupBounds(group);
      if (!bounds) continue;

      const isFar = (bounds.absBottom < aboveLine) || (bounds.absTop > belowLine);
      const isUnmounted = CORE_UM_isTurnGroupUnmounted(group);
      const isProtected = CORE_UM_isTurnGroupProtected(group);
      const shouldScrollRestore = CORE_UM_isScrollRestoreEnabled();

      if ((isProtected && isUnmounted) || (!isFar && isUnmounted && shouldScrollRestore)) {
        CORE_UM_softRemount(group.primaryUid, reason || STR_UNMOUNTM_RESTORE);
        remountedCount += 1;
      } else if (isFar && !isUnmounted && !isProtected) {
        CORE_UM_softUnmount(group, reason || STR_UNMOUNTM_UNMOUNT_REASON);
        unmountedCount += 1;
      }
    }

    const changed = unmountedCount + remountedCount;
    if (changed > 0) {
      CORE_UM_requestMiniMapSync('pass', {
        reason: String(reason || ''),
        changed,
        unmounted: unmountedCount,
        remounted: remountedCount,
      });
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

    document.addEventListener('click', UI_UM_handlePlaceholderClick, true);

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

      API_UM_requestMountByUid(msgId, STR_UNMOUNTM_MOUNT_REQUEST_REASON);
    };

    W.addEventListener(EV_UNMOUNTM_INLINE_CHANGED, S.onInlineChanged);
    W.addEventListener(EV_UNMOUNTM_INLINE_CHANGED_LEG, S.onInlineChanged);
    W.addEventListener(EV_UNMOUNTM_INLINE_CHANGED_EVT, S.onInlineChanged);

    W.addEventListener(EV_UNMOUNTM_MSG_REMOUNTED, S.onRemounted);
    W.addEventListener(EV_UNMOUNTM_MSG_REMOUNTED_LEG, S.onRemounted);
    W.addEventListener(EV_UNMOUNTM_MSG_REMOUNTED_EVT, S.onRemounted);

    W.addEventListener(EV_UNMOUNTM_MSG_MOUNT_REQ, S.onMountReq);
    W.addEventListener(EV_UNMOUNTM_MSG_MOUNT_REQ_LEG, S.onMountReq);

    CORE_UM_restartIntervalTimer();
  }


  function CORE_UM_findMessagesRoot() {
    // Prefer the nearest stable container around conversation turns to keep MO narrow.
    const firstTurn = document.querySelector(SEL_UNMOUNTM_CONV_TURN);
    if (firstTurn && firstTurn.parentElement) return firstTurn.parentElement;

    const firstMsg = document.querySelector(SEL_UNMOUNTM_MSG_ANY);
    if (firstMsg && firstMsg.parentElement) return firstMsg.parentElement;

    return null;
  }

  function CORE_UM_installRootMO() {
    if (S.rootMO) return;
    if (typeof MutationObserver !== 'function') return;

    const root = CORE_UM_findMessagesRoot() || document.querySelector(SEL_UNMOUNTM_ROOT_MAIN) || document.body;
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
    S.rootMO.observe(root, { childList: true, subtree: true });
  }

  function API_UM_getConfigSnapshot() {
    return {
      enabled: !!C.enabled,
      minMsgsForUnmount: C.minMsgsForUnmount,
      unmountMarginPx: C.unmountMarginPx,
      restoreMode: UTIL_UM_normalizeRestoreMode(C.restoreMode, CFG_UNMOUNTM_DEFAULT_RESTORE_MODE),
      passMinIntervalMs: C.passMinIntervalMs,
      intervalMs: C.intervalMs,
      mountProtectMs: C.mountProtectMs,
      keepQuoteCache: !!C.keepQuoteCache,
      keepRevisionMeta: !!C.keepRevisionMeta,
    };
  }

  function API_UM_applySetting(optKey, val) {
    const key = String(optKey || '').trim();
    let changed = false;

    switch (key) {
      case 'umEnabled': {
        const next = !!val;
        if (C.enabled !== next) {
          C.enabled = next;
          changed = true;
        }
        if (!next) API_UM_remountAll('disable');
        break;
      }
      case 'umMinMessages': {
        const next = UTIL_UM_clampInt(val, CFG_UNMOUNTM_MIN_MSGS_MIN, CFG_UNMOUNTM_MIN_MSGS_MAX, C.minMsgsForUnmount);
        if (C.minMsgsForUnmount !== next) {
          C.minMsgsForUnmount = next;
          changed = true;
        }
        break;
      }
      case 'umMarginPx': {
        const next = UTIL_UM_clampInt(val, CFG_UNMOUNTM_MARGIN_MIN, CFG_UNMOUNTM_MARGIN_MAX, C.unmountMarginPx);
        if (C.unmountMarginPx !== next) {
          C.unmountMarginPx = next;
          changed = true;
        }
        break;
      }
      case 'umRestoreMode': {
        const next = UTIL_UM_normalizeRestoreMode(val, C.restoreMode);
        if (C.restoreMode !== next) {
          C.restoreMode = next;
          changed = true;
        }
        break;
      }
      case 'umIntervalSec': {
        const sec = UTIL_UM_clampInt(val, Math.round(CFG_UNMOUNTM_INTERVAL_MIN / 1000), Math.round(CFG_UNMOUNTM_INTERVAL_MAX / 1000), Math.round(C.intervalMs / 1000));
        const next = sec * 1000;
        if (C.intervalMs !== next) {
          C.intervalMs = next;
          changed = true;
          CORE_UM_restartIntervalTimer();
        }
        break;
      }
      case 'umMountProtectMs': {
        const next = UTIL_UM_clampInt(val, CFG_UNMOUNTM_MOUNT_PROTECT_MIN, CFG_UNMOUNTM_MOUNT_PROTECT_MAX, C.mountProtectMs);
        if (C.mountProtectMs !== next) {
          C.mountProtectMs = next;
          changed = true;
        }
        break;
      }
      case 'umKeepQuoteCache': {
        const next = !!val;
        if (C.keepQuoteCache !== next) {
          C.keepQuoteCache = next;
          changed = true;
        }
        break;
      }
      case 'umKeepRevisionMeta': {
        const next = !!val;
        if (C.keepRevisionMeta !== next) {
          C.keepRevisionMeta = next;
          changed = true;
        }
        break;
      }
      default:
        return false;
    }

    if (changed) {
      CFG_UM_save();
      CORE_UM_markMsgsDirty(`cfg:${key}`);
      CORE_UM_scheduleUpdate(`cfg:${key}`);
      SURFACE_UM_emitConfigChanged(`cfg:${key}`);
    }
    return changed;
  }

  function API_UM_setEnabled(on) {
    API_UM_applySetting('umEnabled', !!on);
    return !!C.enabled;
  }

  function API_UM_runPass(why = 'api:run-pass') {
    CORE_UM_markMsgsDirty(String(why || 'api:run-pass'));
    CORE_UM_runUnmountPass(String(why || 'api:run-pass'));
    return true;
  }

  function SURFACE_UM_registerMsgMountApi() {
    H2O.msg = H2O.msg || {};
    if (typeof H2O.msg.ensureMountedById !== 'function') {
      H2O.msg.ensureMountedById = (id) => API_UM_requestMountByUid(id, 'core:msg.ensure');
    }
    if (typeof H2O.msg.requestMountById !== 'function') {
      H2O.msg.requestMountById = (id) => API_UM_requestMountByUid(id, 'core:msg.request');
    }
  }

  function SURFACE_UM_registerControlHubFeature() {
    const getSummary = () => (
      C.enabled
        ? `Enabled • min ${C.minMsgsForUnmount} msgs • margin ${C.unmountMarginPx}px • restore ${CORE_UM_getRestoreModeLabel()}`
        : 'Disabled • all turns stay mounted'
    );
    const cfg = {
      key: 'unmountMessages',
      label: 'Unmount Messages',
      description: 'Soft virtual-scrolling for long chats (Dock/MiniMap compatible).',
      enabled() { return !!C.enabled; },
      setEnabled(on) { API_UM_setEnabled(!!on); },
      applySetting(optKey, val) { return API_UM_applySetting(optKey, val); },
      getSummary,
    };

    const attach = (host) => {
      if (!host) return;
      host.features = host.features || {};
      host.features.unmountMessages = cfg;
    };

    W.h2oConfig = W.h2oConfig || {};
    W.hoConfig = W.hoConfig || W.h2oConfig;
    attach(W.h2oConfig);
    attach(W.hoConfig);
    SURFACE_UM_bindCommandBarFeature();
  }

  function SURFACE_UM_emitConfigChanged(reason = 'cfg') {
    const detail = {
      source: 'unmount-messages',
      reason: String(reason || 'cfg'),
      config: API_UM_getConfigSnapshot(),
      collapsedCount: CORE_UM_getCollapsedGroupCount(),
      ts: Date.now(),
    };
    try { W.dispatchEvent(new CustomEvent(EV_UNMOUNTM_CFG_CHANGED_EVT, { detail })); } catch (_) {}
    SURFACE_UM_syncCommandBarControls();
    return detail;
  }

  function SURFACE_UM_getCommandBarApi() {
    const api = W.H2O?.commandBar;
    if (!api || typeof api !== 'object') return null;
    for (const key of ['ensureMounted', 'registerGroup', 'registerControl', 'patchControl', 'removeOwner']) {
      if (typeof api[key] !== 'function') return null;
    }
    return api;
  }

  function SURFACE_UM_clearCommandBarBindTimer() {
    if (!S.commandBarBindTimer) return;
    try { W.clearInterval(S.commandBarBindTimer); } catch (_) {}
    S.commandBarBindTimer = 0;
  }

  function SURFACE_UM_scheduleCommandBarBindRetry() {
    if (S.commandBarBound && SURFACE_UM_getCommandBarApi()) {
      SURFACE_UM_clearCommandBarBindTimer();
      return 0;
    }
    if (S.commandBarBindTimer) return S.commandBarBindTimer;
    S.commandBarBindTimer = W.setInterval(() => {
      const api = SURFACE_UM_bindCommandBarFeature();
      if (api) SURFACE_UM_clearCommandBarBindTimer();
    }, 350);
    return S.commandBarBindTimer;
  }

  function SURFACE_UM_syncCommandBarControls() {
    const api = S.commandBarApi || SURFACE_UM_getCommandBarApi();
    if (!api || !S.commandBarBound) return false;
    const collapsedCount = CORE_UM_getCollapsedGroupCount();
    const summary = C.enabled
      ? `Unmount Messages is ON • min ${C.minMsgsForUnmount} • margin ${C.unmountMarginPx}px • restore ${CORE_UM_getRestoreModeLabel()} • click to disable`
      : 'Unmount Messages is OFF • click to enable';
    api.patchControl('um.toggle', {
      text: C.enabled ? 'UM·ON' : 'UM·OFF',
      title: summary,
      disabled: false,
    });
    api.patchControl('um.pass', {
      text: 'UM·Pass',
      title: C.enabled ? 'Run an unmount pass now' : 'Unmount Messages is OFF',
      disabled: !C.enabled,
    });
    api.patchControl('um.restore', {
      text: 'UM·Restore',
      title: collapsedCount > 0 ? `Remount ${collapsedCount} collapsed turn(s)` : 'No collapsed turns to restore',
      disabled: collapsedCount <= 0,
    });
    return true;
  }

  function SURFACE_UM_bindCommandBarFeature() {
    const api = SURFACE_UM_getCommandBarApi();
    if (!api) {
      S.commandBarApi = null;
      S.commandBarBound = false;
      SURFACE_UM_scheduleCommandBarBindRetry();
      return null;
    }
    try { api.ensureMounted(); } catch (_) {}
    if (S.commandBarApi && S.commandBarApi !== api) S.commandBarBound = false;
    S.commandBarApi = api;

    if (!S.commandBarBound) {
      api.removeOwner('um');
      api.registerGroup({ id: 'um.main', owner: 'um', zone: 'main', order: 300 });
      api.registerControl({
        id: 'um.toggle',
        owner: 'um',
        groupId: 'um.main',
        order: 100,
        type: 'button',
        className: 'um-toggle',
        text: 'UM·ON',
        title: 'Toggle Unmount Messages',
        onClick: () => {
          API_UM_setEnabled(!C.enabled);
          SURFACE_UM_emitConfigChanged('command-bar:toggle');
        },
      });
      api.registerControl({
        id: 'um.pass',
        owner: 'um',
        groupId: 'um.main',
        order: 200,
        type: 'button',
        className: 'um-pass',
        text: 'UM·Pass',
        title: 'Run Unmount Messages pass',
        onClick: () => {
          API_UM_runPass('command-bar:pass');
          SURFACE_UM_syncCommandBarControls();
        },
      });
      api.registerControl({
        id: 'um.restore',
        owner: 'um',
        groupId: 'um.main',
        order: 300,
        type: 'button',
        className: 'um-restore',
        text: 'UM·Restore',
        title: 'Remount all collapsed turns',
        onClick: () => {
          API_UM_remountAll('command-bar:restore');
          SURFACE_UM_syncCommandBarControls();
        },
      });
      S.commandBarBound = true;
    }

    SURFACE_UM_syncCommandBarControls();
    SURFACE_UM_clearCommandBarBindTimer();
    return api;
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
      SURFACE_UM_registerMsgMountApi();
      SURFACE_UM_registerControlHubFeature();
      CFG_UM_save();
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
      document.removeEventListener('click', UI_UM_handlePlaceholderClick, true);

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
      SURFACE_UM_clearCommandBarBindTimer();
      try { S.commandBarApi?.removeOwner?.('um'); } catch (_) {}
      S.commandBarBound = false;
      S.commandBarApi = null;
      try { delete W[KEY_UNMOUNTM_GUARD_INTERVAL]; } catch (_) {}
      try { delete W[KEY_UNMOUNTM_GUARD_BOOT]; } catch (_) {}
      try { delete W[KEY_UNMOUNTM_GUARD_EVENTS]; } catch (_) {}
      try { delete W[KEY_UNMOUNTM_GUARD_STYLE]; } catch (_) {}
      try { delete W[KEY_UNMOUNTM_GUARD_START_MO]; } catch (_) {}

      try { document.getElementById(CSS_UNMOUNTM_STYLE_ID)?.remove(); } catch (_) {}
      try { API_UM_remountAll('dispose'); } catch (_) {}

      try { S.unmountMap.clear(); } catch (_) {}
      try { S.uidAliasToPrimary.clear(); } catch (_) {}
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
  VAULT.api.requestMountByUid = API_UM_requestMountByUid;
  VAULT.api.remountAll = API_UM_remountAll;
  VAULT.api.waitUntilRemounted = API_UM_waitUntilRemounted;
  VAULT.api.resolvePrimaryUid = CORE_UM_resolvePrimaryUid;
  VAULT.api.getConfig = API_UM_getConfigSnapshot;
  VAULT.api.applySetting = API_UM_applySetting;
  VAULT.api.setEnabled = API_UM_setEnabled;
  VAULT.api.runPass = API_UM_runPass;

  /* ───────────────────────────── 13) Start Gate ───────────────────────────── */

  function CORE_UM_waitForMessagesThenBoot() {
    if (W[KEY_UNMOUNTM_GUARD_START_MO]) return;
    W[KEY_UNMOUNTM_GUARD_START_MO] = 1;

    const tryBoot = () => {
      const msgs = CORE_UM_getMessages();
      CORE_UM_boot();
      if (msgs.length && S.startMO) { try { S.startMO.disconnect(); } catch (_) {} S.startMO = null; }
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
