// ==UserScript==
// @h2o-id             0c2a.unmount.messages
// @name               0C2a.⬛️⛰️ Unmount Messages Engine ⛰️
// @namespace          H2O.Premium.CGX.unmount.messages
// @author             HumamDev
// @version            1.3.2
// @revision           002
// @build              260328-002627
// @description        Engine facade for ChatGPT soft message unmounting. Preserves the existing H2O.UM.nmntmssgs public contract while delegating ChatGPT DOM work to the chat adapter.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Unmount Messages Engine (Pass 1 structural split)
   * Owns the shared vault, persisted config, public API registration, and the
   * engine↔adapter seam. ChatGPT DOM/runtime behavior lives in 0B1b.
   * ========================================================================== */

  const TOK = 'UM';
  const PID = 'nmntmssgs';
  const CID = 'unmountm';
  const SkID = 'nmms';
  const MODTAG = 'UnmountMEngine';
  const SUITE = 'prm';
  const HOST = 'cgx';
  const DsID = PID;
  const BrID = PID;

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});

  VAULT.meta = VAULT.meta || {
    tok: TOK,
    pid: PID,
    cid: CID,
    skid: SkID,
    modtag: MODTAG,
    suite: SUITE,
    host: HOST,
  };
  VAULT.meta.role = 'engine';

  const NS_MEM_UNMOUNTM_ROOT = `${TOK}:${PID}:guard`;
  const KEY_UNMOUNTM_CFG_V1 = `h2o:${SUITE}:${HOST}:${DsID}:cfg:runtime:v1`;
  const KEY_UNMOUNTM_PENDING_BOOT = `${NS_MEM_UNMOUNTM_ROOT}:pendingBoot`;

  const CFG_UNMOUNTM_DEFAULT_ENABLED = true;
  const CFG_UNMOUNTM_DEFAULT_MIN_MSGS_FOR_UNMOUNT = 25;
  const CFG_UNMOUNTM_DEFAULT_UNMOUNT_MARGIN_PX = 2000;
  const CFG_UNMOUNTM_DEFAULT_RESTORE_MODE = 'both';
  const CFG_UNMOUNTM_DEFAULT_PASS_MIN_INTERVAL_MS = 120;
  const CFG_UNMOUNTM_DEFAULT_INTERVAL_MS = 20000;
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
  const CFG_UNMOUNTM_RESTORE_MODES = Object.freeze(['scroll', 'click', 'both']);
  const CFG_UNMOUNTM_WAITER_TIMEOUT_MS = 1200;

  VAULT.diag = VAULT.diag || {
    ver: 'unmountm-contract-v2',
    bootCount: 0,
    lastBootAt: 0,
    steps: [],
    lastError: null,
  };

  VAULT.state = VAULT.state || {
    booted: false,
    unmountMap: new Map(),
    manualCollapseById: new Map(),
    uidAliasToPrimary: new Map(),
    scheduled: false,
    lastPassAt: 0,
    msgsCache: [],
    msgsDirty: true,
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
    hubMutOff: null,
    startMO: null,
    intervalT: 0,
    pageChangedBound: false,
    offPageChanged: null,
    commandBarBindTimer: 0,
    commandBarBound: false,
    commandBarApi: null,
    remountWaiters: new Map(),
    protectUntil: new Map(),
    clickRestoreViewportToken: 0,
  };

  const S = VAULT.state;

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

  function UM_getAdapter() {
    return (VAULT.chatAdapter && typeof VAULT.chatAdapter === 'object') ? VAULT.chatAdapter : null;
  }

  function UM_emitConfigChanged(reason = 'cfg') {
    const detail = {
      source: 'unmount-messages',
      reason: String(reason || 'cfg'),
      config: API_UM_getConfigSnapshot(),
      collapsedCount: (() => {
        const adapter = UM_getAdapter();
        return typeof adapter?.getCollapsedGroupCount === 'function' ? adapter.getCollapsedGroupCount() : 0;
      })(),
      ts: Date.now(),
    };
    try { W.dispatchEvent(new CustomEvent('evt:h2o:unmount:configchanged', { detail })); } catch (_) {}
    try { UM_getAdapter()?.syncCommandBarControls?.(); } catch (_) {}
    return detail;
  }

  function API_UM_applySetting(optKey, val) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.applySetting === 'function') {
      return !!adapter.applySetting(optKey, val);
    }

    const key = String(optKey || '').trim();
    let changed = false;
    switch (key) {
      case 'umEnabled': {
        const next = !!val;
        if (C.enabled !== next) {
          C.enabled = next;
          changed = true;
        }
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
      UM_emitConfigChanged(`cfg:${key}`);
    }
    return changed;
  }

  function API_UM_setEnabled(on) {
    API_UM_applySetting('umEnabled', !!on);
    return !!C.enabled;
  }

  function API_UM_runPass(why = 'api:run-pass') {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.runPass === 'function') return !!adapter.runPass(why);
    return false;
  }

  function API_UM_requestMountByUid(uid, why) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.requestMountByUid === 'function') return !!adapter.requestMountByUid(uid, why);
    return false;
  }

  function API_UM_requestMountPairByUid(uid, why) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.requestMountPairByUid === 'function') return !!adapter.requestMountPairByUid(uid, why);
    return API_UM_requestMountByUid(uid, why);
  }

  function API_UM_forceRemountByUid(uid, why) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.forceRemountByUid === 'function') return !!adapter.forceRemountByUid(uid, why);
    return false;
  }

  function API_UM_collapseById(id, opts = {}) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.collapseById === 'function') {
      return adapter.collapseById(id, opts);
    }
    return { ok: false, status: 'adapter-unavailable', id: String(id || '').trim(), collapsed: false };
  }

  function API_UM_expandById(id, opts = {}) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.expandById === 'function') {
      return adapter.expandById(id, opts);
    }
    return { ok: false, status: 'adapter-unavailable', id: String(id || '').trim(), collapsed: false };
  }

  function API_UM_toggleById(id, opts = {}) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.toggleById === 'function') {
      return adapter.toggleById(id, opts);
    }
    return { ok: false, status: 'adapter-unavailable', id: String(id || '').trim(), collapsed: false };
  }

  function API_UM_collapseManyByIds(ids, opts = {}) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.collapseManyByIds === 'function') {
      return adapter.collapseManyByIds(ids, opts);
    }
    return { ok: false, status: 'adapter-unavailable', ids: Array.isArray(ids) ? ids.slice() : [], changed: 0 };
  }

  function API_UM_expandManyByIds(ids, opts = {}) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.expandManyByIds === 'function') {
      return adapter.expandManyByIds(ids, opts);
    }
    return { ok: false, status: 'adapter-unavailable', ids: Array.isArray(ids) ? ids.slice() : [], changed: 0 };
  }

  function API_UM_isCollapsedById(id, opts = {}) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.isCollapsedById === 'function') {
      return !!adapter.isCollapsedById(id, opts);
    }
    return false;
  }

  function API_UM_getManualCollapsedIds(opts = {}) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.getManualCollapsedIds === 'function') {
      const out = adapter.getManualCollapsedIds(opts);
      return Array.isArray(out) ? out : [];
    }
    return [];
  }

  function API_UM_remountAll(why) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.remountAll === 'function') return adapter.remountAll(why);
    return 0;
  }

  function API_UM_waitUntilRemounted(uid, timeoutMs = CFG_UNMOUNTM_WAITER_TIMEOUT_MS) {
    const adapter = UM_getAdapter();
    if (adapter && typeof adapter.waitUntilRemounted === 'function') {
      return adapter.waitUntilRemounted(uid, timeoutMs);
    }
    return Promise.resolve({
      ok: false,
      reason: 'adapter-unavailable',
      uid: String(uid || '').trim(),
      timeoutMs: Number(timeoutMs || CFG_UNMOUNTM_WAITER_TIMEOUT_MS) || CFG_UNMOUNTM_WAITER_TIMEOUT_MS,
    });
  }

  function CORE_UM_boot(reason = 'boot') {
    const adapter = UM_getAdapter();
    if (!adapter || typeof adapter.boot !== 'function') {
      W[KEY_UNMOUNTM_PENDING_BOOT] = String(reason || 'boot');
      return false;
    }
    return !!adapter.boot(reason);
  }

  function CORE_UM_dispose(reason = 'dispose') {
    const adapter = UM_getAdapter();
    if (!adapter || typeof adapter.dispose !== 'function') return false;
    return !!adapter.dispose(reason);
  }

  function CORE_UM_attachChatAdapter(adapterApi) {
    if (!adapterApi || typeof adapterApi !== 'object') return null;
    VAULT.chatAdapter = adapterApi;
    const pendingBootReason = String(W[KEY_UNMOUNTM_PENDING_BOOT] || '').trim();
    if (pendingBootReason && typeof adapterApi.waitForMessagesThenBoot === 'function') {
      try {
        adapterApi.waitForMessagesThenBoot(pendingBootReason);
      } catch (_) {}
      try { delete W[KEY_UNMOUNTM_PENDING_BOOT]; } catch (_) {}
    }
    return adapterApi;
  }

  function CORE_UM_detachChatAdapter() {
    const prev = UM_getAdapter();
    if (!prev) return null;
    VAULT.chatAdapter = null;
    return prev;
  }

  function CORE_UM_isAdapterReady() {
    return !!UM_getAdapter();
  }

  VAULT.engine = VAULT.engine || {};
  VAULT.engine.attachChatAdapter = CORE_UM_attachChatAdapter;
  VAULT.engine.detachChatAdapter = CORE_UM_detachChatAdapter;
  VAULT.engine.isAdapterReady = CORE_UM_isAdapterReady;
  VAULT.engine.getChatAdapter = UM_getAdapter;
  VAULT.engine.getConfigSnapshot = API_UM_getConfigSnapshot;
  VAULT.engine.emitConfigChanged = UM_emitConfigChanged;

  VAULT.api = VAULT.api || {};
  VAULT.api.boot = CORE_UM_boot;
  VAULT.api.dispose = CORE_UM_dispose;
  VAULT.api.forceRemountByUid = API_UM_forceRemountByUid;
  VAULT.api.collapseById = API_UM_collapseById;
  VAULT.api.expandById = API_UM_expandById;
  VAULT.api.toggleById = API_UM_toggleById;
  VAULT.api.collapseManyByIds = API_UM_collapseManyByIds;
  VAULT.api.expandManyByIds = API_UM_expandManyByIds;
  VAULT.api.isCollapsedById = API_UM_isCollapsedById;
  VAULT.api.getManualCollapsedIds = API_UM_getManualCollapsedIds;
  VAULT.api.requestMountByUid = API_UM_requestMountByUid;
  VAULT.api.requestMountPairByUid = API_UM_requestMountPairByUid;
  VAULT.api.remountAll = API_UM_remountAll;
  VAULT.api.waitUntilRemounted = API_UM_waitUntilRemounted;
  VAULT.api.resolvePrimaryUid = (id) => UM_getAdapter()?.resolvePrimaryUid?.(id) || String(id || '').replace(/^conversation-turn-/, '').trim();
  VAULT.api.getConfig = API_UM_getConfigSnapshot;
  VAULT.api.applySetting = API_UM_applySetting;
  VAULT.api.setEnabled = API_UM_setEnabled;
  VAULT.api.runPass = API_UM_runPass;

  if (!W[KEY_UNMOUNTM_PENDING_BOOT]) {
    W[KEY_UNMOUNTM_PENDING_BOOT] = 'init';
  }
})();
