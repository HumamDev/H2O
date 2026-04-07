// ==UserScript==
// @h2o-id             0b1d.chat.mechanisms.router
// @name               0B1d.⚫️🔀⚡ Chat Mechanisms Router (🤝 Integration)⚡
// @namespace          H2O.Premium.CGX.chat.mechanisms.router
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260405-000000
// @description        Coordination layer for chat gesture backends. Normalizes Control Hub mechanism settings and routes owner gestures into legacy or engine-backed behavior without moving UX ownership.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const TOK = 'CM';
  const PID = 'chtmech';
  const CID = 'chatmechanisms';
  const SkID = 'cmrt';
  const MODTAG = 'ChatMechanismsRouter';
  const SUITE = 'prm';
  const HOST = 'cgx';
  const BrID = PID;

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };

  const KEY_CHUB_CHAT_MECHANISMS_V1 = 'h2o:prm:cgx:cntrlhb:state:chat-mechanisms:v1';
  const EV_CHAT_MECHANISMS_CHANGED = 'evt:h2o:chat-mechanisms:changed';

  const GESTURE_BACKENDS = new Set(['legacy', 'engine', 'off']);
  const DIVIDER_DBLCLICK_MODES = new Set(['pagination-focus-page', 'unmount-page-collapse']);

  function safeDispatch(name, detail) {
    try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  }

  function safeReadJSON(key, fallback) {
    try {
      const raw = W.localStorage?.getItem?.(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function safeWriteJSON(key, value) {
    try {
      W.localStorage?.setItem?.(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function normalizeId(id) {
    return String(id || '').replace(/^conversation-turn-/, '').trim();
  }

  function getUnmountApi() {
    return W.H2O?.UM?.nmntmssgs?.api || null;
  }

  function getPaginationApi() {
    return W.H2O_Pagination || null;
  }

  function readLiveGlobals() {
    const umCfg = (() => {
      try { return getUnmountApi()?.getConfig?.() || null; } catch (_) { return null; }
    })();
    const pwCfg = (() => {
      try { return getPaginationApi()?.getConfig?.() || null; } catch (_) { return null; }
    })();
    return {
      globalUnmount: umCfg?.enabled === true,
      globalPagination: pwCfg?.enabled === true,
    };
  }

  function emitLegacyAnswerCollapse(answerId, collapsed) {
    const id = normalizeId(answerId);
    if (!id) return false;
    safeDispatch('evt:h2o:answer:collapse', { answerId: id, collapsed: !!collapsed });
    return true;
  }

  function isManualResultOk(result) {
    return !!(result && result.ok !== false);
  }

  function normalizeGestureBackend(value, globals = readLiveGlobals()) {
    const raw = String(value || 'legacy').trim().toLowerCase();
    let next = GESTURE_BACKENDS.has(raw) ? raw : 'legacy';
    if (next === 'off' && !globals.globalUnmount && !globals.globalPagination) next = 'legacy';
    return next;
  }

  function normalizeDividerMode(value) {
    const raw = String(value || 'pagination-focus-page').trim().toLowerCase();
    return DIVIDER_DBLCLICK_MODES.has(raw) ? raw : 'pagination-focus-page';
  }

  function normalizeCoordination(value) {
    const src = (value && typeof value === 'object') ? value : {};
    return {
      manualWinsOverGlobal: src.manualWinsOverGlobal !== false,
      preserveLegacyEvents: src.preserveLegacyEvents !== false,
      preserveUxOwners: src.preserveUxOwners !== false,
    };
  }

  function normalizeConfig(input, globals = readLiveGlobals()) {
    const src = (input && typeof input === 'object') ? input : {};
    return {
      version: 1,
      gestureBackend: normalizeGestureBackend(src.gestureBackend, globals),
      dividerDblClickMode: normalizeDividerMode(src.dividerDblClickMode),
      coordination: normalizeCoordination(src.coordination),
    };
  }

  function readStoredConfig() {
    return safeReadJSON(KEY_CHUB_CHAT_MECHANISMS_V1, null);
  }

  function writeStoredConfig(cfg) {
    return safeWriteJSON(KEY_CHUB_CHAT_MECHANISMS_V1, cfg);
  }

  VAULT.state = VAULT.state || {
    config: null,
    lastChangedAt: 0,
    lastReason: '',
  };
  const S = VAULT.state;

  function ensureConfigCurrent(emit = false, reason = 'normalize') {
    const globals = readLiveGlobals();
    const current = normalizeConfig(S.config || readStoredConfig(), globals);
    const changed = JSON.stringify(S.config || null) !== JSON.stringify(current);
    S.config = current;
    if (changed) {
      writeStoredConfig(current);
      if (emit) emitChanged(reason);
    }
    return current;
  }

  function getConfig() {
    return { ...ensureConfigCurrent(false) };
  }

  function setConfig(partial) {
    const current = ensureConfigCurrent(false);
    const next = normalizeConfig({
      ...current,
      ...((partial && typeof partial === 'object') ? partial : {}),
      coordination: {
        ...current.coordination,
        ...(((partial && typeof partial === 'object') ? partial.coordination : null) || {}),
      },
    }, readLiveGlobals());
    S.config = next;
    writeStoredConfig(next);
    emitChanged('setConfig');
    return { ...next };
  }

  function isLegacyGestureBackend() {
    return getConfig().gestureBackend === 'legacy';
  }

  function isEngineGestureBackend() {
    return getConfig().gestureBackend === 'engine';
  }

  function isGlobalUnmountEnabled() {
    return !!readLiveGlobals().globalUnmount;
  }

  function isGlobalPaginationEnabled() {
    return !!readLiveGlobals().globalPagination;
  }

  function getResolvedMode() {
    const cfg = getConfig();
    const globals = readLiveGlobals();
    const anyGlobal = !!(globals.globalUnmount || globals.globalPagination);
    let label = 'Method 1 only';
    if (cfg.gestureBackend === 'engine') label = anyGlobal ? 'Method 2 + Method 3' : 'Method 2 only';
    else if (cfg.gestureBackend === 'off') label = 'Method 3 only';
    else label = anyGlobal ? 'Method 1 + Method 3' : 'Method 1 only';
    return {
      gestureBackend: cfg.gestureBackend,
      dividerDblClickMode: cfg.dividerDblClickMode,
      globalUnmount: !!globals.globalUnmount,
      globalPagination: !!globals.globalPagination,
      label,
    };
  }

  function emitChanged(reason = 'cfg') {
    const detail = {
      source: 'chat-mechanisms-router',
      reason: String(reason || 'cfg'),
      config: getConfig(),
      resolved: getResolvedMode(),
      ts: Date.now(),
    };
    S.lastChangedAt = detail.ts;
    S.lastReason = detail.reason;
    safeDispatch(EV_CHAT_MECHANISMS_CHANGED, detail);
    return detail;
  }

  function routeAnswerTitleDblClick(ctx = {}) {
    const cfg = getConfig();
    if (cfg.gestureBackend === 'legacy') return { handled: false, backend: 'legacy', action: 'legacy-answer-title-dblclick' };
    if (cfg.gestureBackend === 'off') return { handled: true, backend: 'off', action: 'no-gesture-backend' };

    const answerId = normalizeId(ctx.answerId || ctx.id);
    const api = getUnmountApi();
    if (!answerId || typeof api?.toggleById !== 'function') {
      return { handled: false, backend: 'engine', action: 'unmount-toggle-unavailable', reason: 'unmount-api-unavailable' };
    }

    const result = api.toggleById(answerId, {
      source: 'answer-title',
      preserveShell: 'answer-title',
      emitLegacyAnswerCollapse: true,
    });
    if (!isManualResultOk(result)) {
      return {
        handled: false,
        backend: 'engine',
        action: 'unmount-toggle-failed',
        reason: String(result?.status || 'unmount-toggle-failed'),
      };
    }
    return {
      handled: true,
      backend: 'engine',
      action: 'unmount-toggle-by-id',
      reason: String(result?.status || ''),
    };
  }

  function routeChatPageDotClick(ctx = {}) {
    const cfg = getConfig();
    if (cfg.gestureBackend === 'legacy') return { handled: false, backend: 'legacy', action: 'legacy-chat-page-dot' };
    if (cfg.gestureBackend === 'off') return { handled: true, backend: 'off', action: 'no-gesture-backend' };

    const pageNum = Math.max(1, Number(ctx.pageNum || 0) || 0);
    const chatId = String(ctx.chatId || '').trim();
    const nextEnabled = !!ctx.nextEnabled;
    const answerIds = Array.from(new Set((Array.isArray(ctx.pageAnswerIds) ? ctx.pageAnswerIds : []).map(normalizeId).filter(Boolean)));
    const owner = ctx.owner || {};

    const api = getUnmountApi();
    if (!answerIds.length) {
      try {
        const ownerResult = owner.setTitleListMode?.(pageNum, nextEnabled, {
          chatId,
          source: 'chat-page-divider:dot',
          driver: 'engine',
          animate: false,
        });
        if (ownerResult?.ok === false) {
          return { handled: false, backend: 'engine', action: 'title-list-owner-commit-failed', reason: String(ownerResult?.status || 'owner-commit-failed') };
        }
      } catch (_) {
        return { handled: false, backend: 'engine', action: 'title-list-owner-commit-failed', reason: 'owner-commit-threw' };
      }
      return { handled: true, backend: 'engine', action: nextEnabled ? 'title-list-owner-only-empty' : 'title-list-owner-only-empty-expand', reason: 'no-page-answer-ids' };
    }
    if (typeof api?.collapseManyByIds !== 'function' || typeof api?.expandManyByIds !== 'function') {
      return { handled: false, backend: 'engine', action: nextEnabled ? 'collapse-title-list-unavailable' : 'expand-title-list-unavailable', reason: 'unmount-api-unavailable' };
    }

    const result = nextEnabled
      ? api.collapseManyByIds(answerIds, {
          source: 'title-list-row',
          preserveShell: 'title-list-row',
          preserveQuestionShell: true,
          emitLegacyAnswerCollapse: false,
        })
      : api.expandManyByIds(answerIds, {
          source: 'title-list-row',
          emitLegacyAnswerCollapse: false,
        });
    if (!isManualResultOk(result)) {
      return {
        handled: false,
        backend: 'engine',
        action: nextEnabled ? 'collapse-title-list-failed' : 'expand-title-list-failed',
        reason: String(result?.status || 'manual-engine-failed'),
      };
    }

    try {
      const ownerResult = owner.setTitleListMode?.(pageNum, nextEnabled, {
        chatId,
        source: 'chat-page-divider:dot',
        driver: 'engine',
        animate: false,
      });
      if (ownerResult?.ok === false) {
        const rollback = nextEnabled
          ? api.expandManyByIds(answerIds, { source: 'title-list-row', emitLegacyAnswerCollapse: false })
          : api.collapseManyByIds(answerIds, {
              source: 'title-list-row',
              preserveShell: 'title-list-row',
              preserveQuestionShell: true,
              emitLegacyAnswerCollapse: false,
            });
        return {
          handled: false,
          backend: 'engine',
          action: nextEnabled ? 'collapse-title-list-owner-commit-failed' : 'expand-title-list-owner-commit-failed',
          reason: String(ownerResult?.status || rollback?.status || 'owner-commit-failed'),
        };
      }
    } catch (_) {
      const rollback = nextEnabled
        ? api.expandManyByIds(answerIds, { source: 'title-list-row', emitLegacyAnswerCollapse: false })
        : api.collapseManyByIds(answerIds, {
            source: 'title-list-row',
            preserveShell: 'title-list-row',
            preserveQuestionShell: true,
            emitLegacyAnswerCollapse: false,
          });
      return {
        handled: false,
        backend: 'engine',
        action: nextEnabled ? 'collapse-title-list-owner-commit-failed' : 'expand-title-list-owner-commit-failed',
        reason: String(rollback?.status || 'owner-commit-threw'),
      };
    }

    for (const item of Array.isArray(result?.results) ? result.results : []) {
      if (!item?.legacyAnswerCollapseChanged) continue;
      emitLegacyAnswerCollapse(item.id, nextEnabled ? true : false);
    }

    return {
      handled: true,
      backend: 'engine',
      action: nextEnabled ? 'collapse-title-list-page' : 'expand-title-list-page',
      reason: String(result?.status || ''),
    };
  }

  function routeChatPageDividerDblClick(ctx = {}) {
    const cfg = getConfig();
    if (cfg.gestureBackend === 'legacy') return { handled: false, backend: 'legacy', action: 'legacy-chat-page-divider-dblclick' };
    if (cfg.gestureBackend === 'off') return { handled: true, backend: 'off', action: 'no-gesture-backend' };

    const pageNum = Math.max(1, Number(ctx.pageNum || 0) || 0);
    const chatId = String(ctx.chatId || '').trim();
    const answerIds = Array.from(new Set((Array.isArray(ctx.pageAnswerIds) ? ctx.pageAnswerIds : []).map(normalizeId).filter(Boolean)));
    const owner = ctx.owner || {};

    if (cfg.dividerDblClickMode === 'pagination-focus-page') {
      const api = getPaginationApi();
      if (typeof api?.focusPage !== 'function') {
        return { handled: false, backend: 'engine', action: 'focus-page-unavailable', reason: 'pagination-api-unavailable' };
      }
      const ok = !!api.focusPage(pageNum, {
        source: 'chat-pages-controller:divider-dblclick',
        pageNumber: true,
      });
      if (!ok) {
        return {
          handled: false,
          backend: 'engine',
          action: 'focus-page-failed',
          reason: 'focus-page-failed',
        };
      }
      return {
        handled: true,
        backend: 'engine',
        action: 'focus-page',
        reason: '',
      };
    }

    const nextCollapsed = !!ctx.nextCollapsed;
    const api = getUnmountApi();
    if (!answerIds.length) {
      try {
        const ownerResult = owner.setPageCollapsed?.(pageNum, nextCollapsed, {
          chatId,
          source: 'chat-page-divider:dblclick',
          driver: 'engine',
        });
        if (ownerResult?.ok === false) {
          return { handled: false, backend: 'engine', action: nextCollapsed ? 'page-collapse-owner-commit-failed' : 'page-expand-owner-commit-failed', reason: String(ownerResult?.status || 'owner-commit-failed') };
        }
      } catch (_) {
        return { handled: false, backend: 'engine', action: nextCollapsed ? 'page-collapse-owner-commit-failed' : 'page-expand-owner-commit-failed', reason: 'owner-commit-threw' };
      }
      return { handled: true, backend: 'engine', action: nextCollapsed ? 'page-collapse-owner-only-empty' : 'page-expand-owner-only-empty', reason: 'no-page-answer-ids' };
    }
    if (typeof api?.collapseManyByIds !== 'function' || typeof api?.expandManyByIds !== 'function') {
      return { handled: false, backend: 'engine', action: nextCollapsed ? 'page-collapse-unavailable' : 'page-expand-unavailable', reason: 'unmount-api-unavailable' };
    }

    const result = nextCollapsed
      ? api.collapseManyByIds(answerIds, {
          source: 'page-collapse',
          preserveShell: 'page-collapse',
          preserveQuestionShell: true,
        })
      : api.expandManyByIds(answerIds, {
          source: 'page-collapse',
        });
    if (!isManualResultOk(result)) {
      return {
        handled: false,
        backend: 'engine',
        action: nextCollapsed ? 'collapse-page-failed' : 'expand-page-failed',
        reason: String(result?.status || 'manual-engine-failed'),
      };
    }

    try {
      const ownerResult = owner.setPageCollapsed?.(pageNum, nextCollapsed, {
        chatId,
        source: 'chat-page-divider:dblclick',
        driver: 'engine',
      });
      if (ownerResult?.ok === false) {
        const rollback = nextCollapsed
          ? api.expandManyByIds(answerIds, { source: 'page-collapse' })
          : api.collapseManyByIds(answerIds, {
              source: 'page-collapse',
              preserveShell: 'page-collapse',
              preserveQuestionShell: true,
            });
        return {
          handled: false,
          backend: 'engine',
          action: nextCollapsed ? 'collapse-page-owner-commit-failed' : 'expand-page-owner-commit-failed',
          reason: String(ownerResult?.status || rollback?.status || 'owner-commit-failed'),
        };
      }
    } catch (_) {
      const rollback = nextCollapsed
        ? api.expandManyByIds(answerIds, { source: 'page-collapse' })
        : api.collapseManyByIds(answerIds, {
            source: 'page-collapse',
            preserveShell: 'page-collapse',
            preserveQuestionShell: true,
          });
      return {
        handled: false,
        backend: 'engine',
        action: nextCollapsed ? 'collapse-page-owner-commit-failed' : 'expand-page-owner-commit-failed',
        reason: String(rollback?.status || 'owner-commit-threw'),
      };
    }

    return {
      handled: true,
      backend: 'engine',
      action: nextCollapsed ? 'collapse-page' : 'expand-page',
      reason: String(result?.status || ''),
    };
  }

  ensureConfigCurrent(false);

  VAULT.api = Object.freeze({
    getConfig,
    setConfig,
    getResolvedMode,
    isLegacyGestureBackend,
    isEngineGestureBackend,
    isGlobalUnmountEnabled,
    isGlobalPaginationEnabled,
    routeAnswerTitleDblClick,
    routeChatPageDotClick,
    routeChatPageDividerDblClick,
    emitChanged,
  });
})();
