// ==H2O Module==
// @h2o-id             1a1c.minimap.engine
// @name               1A1c.🟥🗺️ MiniMap Engine 🚀🗺️
// @namespace          H2O.Premium.CGX.minimap.engine
// @author             HumamDev
// @version            12.7.0
// @revision           006
// @build              260329-012900
// @description        MiniMap Engine: hard runtime authority (observers, rebuild scheduling, active sync)
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

/* Cutover Smoke Test Checklist
 * - Kernel+Shell+Engine (Main optional): MiniMap appears, updates, navigates
 * - Kernel+Shell+Main+Engine: no double observers, no duplicate rebuild loops
 * - Remove Main: system remains functional (target architecture)
 */

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const TOPW = W.top || W;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;
  H2O.perf = H2O.perf || {};
  H2O.perf.modules = H2O.perf.modules || Object.create(null);
  const PERF_MODULE = (H2O.perf.modules.miniMapEngine && typeof H2O.perf.modules.miniMapEngine === 'object')
    ? H2O.perf.modules.miniMapEngine
    : (H2O.perf.modules.miniMapEngine = Object.create(null));
  const PERF = (() => {
    const existing = PERF_MODULE.__h2oPerfState;
    if (existing && typeof existing === 'object') return existing;
    const next = createMiniMapEnginePerfState();
    try {
      Object.defineProperty(PERF_MODULE, '__h2oPerfState', {
        value: next,
        configurable: true,
        writable: true,
      });
    } catch {
      PERF_MODULE.__h2oPerfState = next;
    }
    return next;
  })();
  ensureMiniMapEnginePerfStateShape(PERF);
  PERF_MODULE.getStats = getMiniMapEnginePerfStats;
  PERF_MODULE.resetStats = () => {
    resetMiniMapEnginePerfState(PERF);
    return getMiniMapEnginePerfStats();
  };

  // Kernel-authoritative bridge access (no fallbacks here; util.mm decides)
  const MM = () => (TOPW.H2O_MM_SHARED?.get?.() || null)?.util?.mm || null;
  const MM_core = () => MM()?.core?.() || null;
  const MM_ui = () => MM()?.ui?.() || null;
  const MM_rt = () => MM()?.rt?.() || null;
  const MM_behavior = () => (TOPW.H2O_MM_SHARED?.get?.() || null)?.util?.behavior || null;
  const MM_uiRefs = () => MM()?.uiRefs?.() || (MM_ui()?.getRefs?.() || {});
  const MM_schedule = () => TOPW.H2O?.runtime?.schedule || W.H2O?.runtime?.schedule || null;

  const __rafFallback = Object.create(null);

  function MM_scheduleRafOnce(key, fn) {
    const perfBucket = PERF.rafOnce;
    const perfKey = String(key || '').trim() || 'unknown';
    perfBucket.requestedCount = Number(perfBucket.requestedCount || 0) + 1;
    perfBucket.lastKey = perfKey;
    perfBucket.lastAt = Date.now();
    const keyBucket = ensureRafOnceKeyBucket(perfKey);
    keyBucket.requestedCount = Number(keyBucket.requestedCount || 0) + 1;
    keyBucket.lastAt = perfBucket.lastAt;
    const schedule = MM_schedule();
    if (schedule && typeof schedule.rafOnce === 'function') {
      const isPending = typeof schedule.isPending === 'function' ? !!schedule.isPending(key) : false;
      if (isPending) {
        perfBucket.coalescedCount = Number(perfBucket.coalescedCount || 0) + 1;
        keyBucket.coalescedCount = Number(keyBucket.coalescedCount || 0) + 1;
      }
      return schedule.rafOnce(key, () => {
        perfBucket.executedCount = Number(perfBucket.executedCount || 0) + 1;
        keyBucket.executedCount = Number(keyBucket.executedCount || 0) + 1;
        fn();
      });
    }
    if (__rafFallback[key]) {
      perfBucket.coalescedCount = Number(perfBucket.coalescedCount || 0) + 1;
      keyBucket.coalescedCount = Number(keyBucket.coalescedCount || 0) + 1;
      return;
    }
    __rafFallback[key] = requestAnimationFrame(() => {
      delete __rafFallback[key];
      perfBucket.executedCount = Number(perfBucket.executedCount || 0) + 1;
      keyBucket.executedCount = Number(keyBucket.executedCount || 0) + 1;
      fn();
    });
  }

  const ENGINE_VER = '12.7.0';
  const EVT_ENGINE_READY = 'evt:h2o:minimap:engine-ready';
  const EVT_SHELL_READY = 'evt:h2o:minimap:shell-ready';
  const EVT_ROUTE_CHANGED = 'evt:h2o:route:changed';
  const EVT_ANSWERS_SCAN_FALLBACK = 'evt:h2o:answers:scan';
  const EVT_BEHAVIOR_CHANGED = 'evt:h2o:mm:behavior-changed';
  const EVT_MM_INDEX_APPENDED = 'evt:h2o:minimap:index:appended';
  const EVT_MM_INDEX_HYDRATED = 'evt:h2o:minimap:index:hydrated';
  const EVT_MM_VIEW_CHANGED = 'evt:h2o:minimap:view-changed';
  const EVT_SHELL_NO_BUTTONS = 'evt:h2o:minimap:shell:no-buttons';
  const EVT_PAGE_CHANGED = 'evt:h2o:pagination:pagechanged';
  const EVT_PAGE_CHANGED_ALIAS = 'h2o:pagination:pagechanged';
  const EVT_CORE_TURN_UPDATED = 'evt:h2o:core:turn:updated';
  const EVT_COMPLETE_TURN_INDEX_STATE = 'evt:h2o:complete-turn-index:state';
  const EFFECTIVE_TURN_RUNTIME_METHOD = Object.freeze({
    INDEX: ['getEffective', 'PresentationIndex'].join(''),
    STATUS: ['getEffective', 'PresentationStatus'].join(''),
  });

  const BOOT_MAX_TRIES = 80;
  const BOOT_GAP_MS = 120;
  const MO_REBUILD_COOLDOWN_MS = 320;
  const COMPLETE_INDEX_NAV_LIMITS = Object.freeze({
    maxHops: 5,
    totalDurationMs: 5000,
    remountWaitMs: 720,
    duplicateWindowMs: 320,
    errorCodeLength: 96,
  });
  const BOOT_MODE_CACHE_FIRST = 'cache_first';
  const BOOT_MODE_REBUILD_FIRST = 'rebuild_first';
  const PERF_ASSERT_ON = (() => {
    try { return String(localStorage.getItem('h2o:perf') || '') === '1'; } catch { return false; }
  })();
  const S = {
    running: false,
    bootDone: false,
    bootTries: 0,
    bootTimer: null,
    rebuildReason: '',
    syncRAF: 0,
    syncQueued: false,
    syncReasons: new Set(),

    domMO: null,
    panelMO: null,
    panelRootMO: null,
    formRO: null,
    io: null,
    ioObserved: new Set(),

    firstPaintRaf: 0,
    failsafeTimer: null,
    paginationCheckFastTimer: null,
    paginationCheckSlowTimer: null,
    moCooldownDeferredTimer: null,
    identityDriftTrailingTimer: null,
    identityDriftRecoveryVersion: 0,
    identityDriftRecoverySignature: '',
    identityDriftTrailingRetriedSignature: '',
    syntheticCurrentReconcileSignature: '',

    offScroll: null,
    activeScrollRoot: null,
    offResize: null,
    offShellReady: null,
    offBehaviorChanged: null,
    offRouteChanged: null,
    offBtnClick: null,
    offPaginationChanged: null,
    offPaginationChangedAlias: null,
    offIndexAppended: null,
    offIndexHydrated: null,
    offViewChanged: null,
    offShellNoButtons: null,
    offCoreTurnUpdated: null,
    offCompleteTurnIndexState: null,
    offMountTransitions: null,
    offStaleWatchdog: null,
    completeIndexAnchorsBootstrapped: false,

    lastActiveTurnId: '',
    lastActiveBtnId: '',
    lastActiveBtnEl: null,
    perfFullScanTick: 0,
    moRebuildCooldownUntil: 0,
    visibleSet: new Set(),
    mapButtons: null,
    turnListeners: new Set(),
    scrollSyncDisabled: false,
    mmScroller: null,
    mmUser: false,
    mmProgram: false,
    mmUserTimer: null,
    pageJumpTimer: null,
    pageJumpToken: 0,
    pageJumpUntil: 0,
    lastActivePageNum: 0,
    offMmWheel: null,
    offMmTouchStart: null,
    offMmMouseDown: null,
    lastViewMode: '',
    structureRecoveryQueued: false,
    structureRecoveryReason: '',
  };

  // CV-3.4 Gate 4 navigation production seam:begin
  // This coordinator owns cancellation, route scoping, bounds, and state.
  // Host DOM resolution and scrolling remain adapters so the same production
  // algorithm can be exercised deterministically without fixture copies.
  function createCompleteIndexNavigationCoordinator(adapters = {}, options = {}) {
    const limits = Object.freeze({
      ...COMPLETE_INDEX_NAV_LIMITS,
      ...(options?.limits || {}),
    });
    const state = {
      generation: 0,
      status: 'idle',
      targetQId: null,
      targetOrder: 0,
      hopCount: 0,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      routeKey: '',
      active: null,
      lastRequestKey: '',
      lastCompletedAtMs: 0,
      lastResult: null,
    };
    const now = () => Math.max(0, Number(adapters?.now?.() ?? Date.now()) || 0);
    const iso = (value) => {
      try { return new Date(value).toISOString(); } catch { return null; }
    };
    const boundedError = (value) => String(value || '').slice(0, Math.max(16, Number(limits.errorCodeLength || 96)));
    const snapshot = () => Object.freeze({
      status: state.status,
      targetQId: state.targetQId,
      targetOrder: state.targetOrder,
      generation: state.generation,
      hopCount: state.hopCount,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      errorCode: state.errorCode,
    });
    const setState = (status, partial = {}) => {
      state.status = String(status || state.status || 'idle');
      Object.assign(state, partial || {});
      try { adapters?.onState?.(snapshot()); } catch {}
      return snapshot();
    };
    const currentRouteKey = () => String(adapters?.routeKey?.() || '');
    const enabled = () => adapters?.isEnabled?.() === true;
    const cancel = (reason = 'cancelled', status = 'cancelled') => {
      const active = state.active;
      if (!active || active.done) return snapshot();
      active.done = true;
      try { active.controller?.abort?.(boundedError(reason)); } catch {}
      state.active = null;
      state.generation += 1;
      return setState(status, {
        completedAt: iso(now()),
        errorCode: boundedError(reason),
      });
    };
    const staleReason = (operation) => {
      if (!operation || operation.done || operation.generation !== state.generation) return 'cancelled';
      if (!enabled()) return 'gate-disabled';
      if (operation.routeKey !== currentRouteKey()) return 'stale-route';
      // Far materialization legitimately outlives the 5s near-target budget:
      // the host loads history in windows, so the driver extends this one
      // operation's deadline from the measured per-cycle cost. Progress and
      // cancellation are the primary controls; this stays a hard watchdog.
      const deadlineMs = Math.max(
        Number(limits.totalDurationMs || 5000),
        Number(operation.deadlineMs || 0),
      );
      if ((now() - operation.startedAtMs) >= deadlineMs) return 'navigation-timeout';
      return '';
    };
    const finish = (operation, status, partial = {}, result = {}) => {
      if (operation?.generation !== state.generation || operation?.done) {
        return Object.freeze({ handled: true, navigated: false, status: 'cancelled' });
      }
      operation.done = true;
      state.active = null;
      const completedAtMs = now();
      setState(status, {
        completedAt: iso(completedAtMs),
        errorCode: partial?.errorCode ? boundedError(partial.errorCode) : null,
        ...partial,
      });
      const out = Object.freeze({
        handled: true,
        navigated: status === 'navigated',
        status,
        qId: state.targetQId,
        order: state.targetOrder,
        hops: state.hopCount,
        ...result,
      });
      state.lastRequestKey = operation.requestKey;
      state.lastCompletedAtMs = completedAtMs;
      state.lastResult = out;
      return out;
    };
    const navigate = (request = {}) => {
      if (!enabled()) {
        return Promise.resolve(Object.freeze({
          handled: true,
          navigated: false,
          status: 'unavailable',
          errorCode: 'canonical-authority-unavailable',
        }));
      }
      const descriptor = adapters?.describeTarget?.(request) || null;
      if (!descriptor?.qId || !Number.isInteger(Number(descriptor?.order)) || Number(descriptor.order) < 1) {
        return Promise.resolve(Object.freeze({ handled: true, navigated: false, status: 'unreachable', errorCode: 'target-not-owned' }));
      }
      const surface = String(request?.surface || 'answer') === 'question' ? 'question' : 'answer';
      const requestKey = `${currentRouteKey()}|${descriptor.qId}|${surface}`;
      if (state.active && !state.active.done && state.active.requestKey === requestKey) return state.active.promise;
      if (
        state.lastRequestKey === requestKey
        && (now() - state.lastCompletedAtMs) <= Number(limits.duplicateWindowMs || 320)
        && state.lastResult
      ) return Promise.resolve(state.lastResult);
      cancel('superseded', 'cancelled');

      const Controller = adapters?.AbortController || globalThis.AbortController;
      const controller = typeof Controller === 'function' ? new Controller() : null;
      const generation = state.generation + 1;
      state.generation = generation;
      const operation = {
        generation,
        requestKey,
        routeKey: currentRouteKey(),
        startedAtMs: now(),
        controller,
        done: false,
        promise: null,
      };
      state.active = operation;
      setState('resolving', {
        targetQId: descriptor.qId,
        targetOrder: Number(descriptor.order),
        hopCount: 0,
        startedAt: iso(operation.startedAtMs),
        completedAt: null,
        errorCode: null,
        routeKey: operation.routeKey,
      });

      const run = async () => {
        let mounted = adapters?.resolveMounted?.(descriptor, surface) || null;
        if (mounted) {
          setState('target-mounted');
          const navigated = adapters?.navigateMounted?.(mounted, descriptor, surface) !== false;
          return finish(operation, navigated ? 'navigated' : 'unreachable', navigated ? {} : { errorCode: 'precise-navigation-failed' });
        }
        setState('mounting-target');
        // A target beyond the materialised host range cannot be reached by the
        // bounded hop walk — the host renders history in windows. The far
        // driver runs widened native reveal cycles while progress continues,
        // and returns null when the target is near so the hop walk below keeps
        // owning that case unchanged.
        if (typeof adapters?.materializeFar === 'function') {
          const far = await adapters.materializeFar(descriptor, surface, {
            operation,
            isStale: () => staleReason(operation),
            setState,
            extendDeadline: (ms) => {
              operation.deadlineMs = Math.max(Number(operation.deadlineMs || 0), Number(ms) || 0);
            },
          });
          const afterFar = staleReason(operation);
          if (afterFar) {
            const stale = afterFar === 'stale-route';
            return finish(operation, stale ? 'stale-route-discarded' : (afterFar === 'navigation-timeout' ? 'unreachable' : 'cancelled'), {
              errorCode: afterFar,
              hopCount: Number(far?.cycles || 0),
            });
          }
          if (far?.mounted) {
            setState('target-mounted', { hopCount: Number(far.cycles || 0) });
            const aligner = typeof adapters?.alignFar === 'function' ? adapters.alignFar : adapters?.navigateMounted;
            const navigated = (await aligner?.(far.mounted, descriptor, surface)) !== false;
            return finish(
              operation,
              navigated ? 'navigated' : 'unreachable',
              navigated ? { hopCount: Number(far.cycles || 0) } : { errorCode: 'precise-navigation-failed' },
              { farCycles: Number(far.cycles || 0), historyRewrites: Number(far.rewrites || 0) },
            );
          }
          if (far?.attempted) {
            return finish(operation, 'unreachable', {
              errorCode: far.errorCode || 'far-materialization-failed',
              hopCount: Number(far.cycles || 0),
            }, { farCycles: Number(far.cycles || 0), historyRewrites: Number(far.rewrites || 0) });
          }
        }
        for (let hop = 1; hop <= Number(limits.maxHops || 5); hop += 1) {
          const before = staleReason(operation);
          if (before) {
            const stale = before === 'stale-route';
            return finish(operation, stale ? 'stale-route-discarded' : (before === 'navigation-timeout' ? 'unreachable' : 'cancelled'), {
              errorCode: before,
              hopCount: hop - 1,
            });
          }
          state.hopCount = hop;
          setState('mounting-target', { hopCount: hop });
          adapters?.moveToward?.(descriptor, hop, Number(limits.maxHops || 5));
          mounted = await adapters?.waitForMounted?.(
            descriptor,
            surface,
            Number(limits.remountWaitMs || 720),
            controller?.signal || null,
          );
          const after = staleReason(operation);
          if (after) {
            const stale = after === 'stale-route';
            return finish(operation, stale ? 'stale-route-discarded' : (after === 'navigation-timeout' ? 'unreachable' : 'cancelled'), {
              errorCode: after,
              hopCount: hop,
            });
          }
          mounted = mounted || adapters?.resolveMounted?.(descriptor, surface) || null;
          if (!mounted) continue;
          setState('target-mounted', { hopCount: hop });
          const navigated = adapters?.navigateMounted?.(mounted, descriptor, surface) !== false;
          return finish(operation, navigated ? 'navigated' : 'unreachable', navigated ? {} : { errorCode: 'precise-navigation-failed' });
        }
        return finish(operation, 'unreachable', { errorCode: 'maximum-hops-reached' });
      };
      operation.promise = Promise.resolve().then(run).catch((error) => {
        const reason = staleReason(operation);
        if (reason === 'stale-route') return finish(operation, 'stale-route-discarded', { errorCode: reason });
        if (reason === 'gate-disabled' || reason === 'cancelled') return finish(operation, 'cancelled', { errorCode: reason });
        return finish(operation, 'unreachable', { errorCode: error?.code || error?.message || 'navigation-failed' });
      });
      return operation.promise;
    };
    return Object.freeze({ navigate, cancel, getStatus: snapshot, limits });
  }
  // CV-3.4 Gate 4 navigation production seam:end

  function getCoreSurface() {
    return MM_core();
  }

  function disableScrollSync(reason = 'core-missing') {
    if (S.scrollSyncDisabled) return;
    S.scrollSyncDisabled = true;
    warn('Scroll sync disabled.', { reason });
  }

  function hasPendingPageJump() {
    return Number(S.pageJumpUntil || 0) > Date.now();
  }

  function cancelPageJumpGuard(token = 0) {
    const activeToken = Number(S.pageJumpToken || 0);
    if (token && token !== activeToken) return false;
    clearTimer('pageJumpTimer');
    S.pageJumpUntil = 0;
    S.mmProgram = false;
    return true;
  }

  function armPageJumpGuard(ms = 1100, reason = 'page-divider') {
    const waitMs = Math.max(260, Number(ms || 0) || 0);
    const token = Number(S.pageJumpToken || 0) + 1;
    S.pageJumpToken = token;
    S.pageJumpUntil = Date.now() + waitMs;
    S.mmProgram = true;
    clearTimer('pageJumpTimer');
    S.pageJumpTimer = setTimeout(() => {
      if (token !== Number(S.pageJumpToken || 0)) return;
      S.pageJumpTimer = null;
      S.pageJumpUntil = 0;
      S.mmProgram = false;
      if (S.running) scheduleSyncActive(`${String(reason || 'page-divider')}:settled`);
    }, waitMs);
    return token;
  }

  function getDiag() {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    try {
      const d = SH?.diag?.ensure?.({ name: 'H2O MiniMap Engine', diagKey: 'H2O:diag:minimap' });
      return d && typeof d.log === 'function' ? d : null;
    } catch {
      return null;
    }
  }

  function dlog(step, data) {
    try { getDiag()?.log?.(step, data); } catch {}
  }

  function derr(where, err) {
    try { getDiag()?.err?.(err, where); } catch {}
  }

  function warn(msg, extra) { try { console.warn('[MiniMap Engine]', msg, extra || ''); } catch {} }

  function perfNow() {
    const n = Number(W.performance?.now?.() || Date.now());
    return Number.isFinite(n) ? n : 0;
  }

  function perfRoundMs(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 1000) / 1000;
  }

  function createDurationBucket() {
    return {
      count: 0,
      totalMs: 0,
      maxMs: 0,
      slowOver4Count: 0,
      slowOver8Count: 0,
      slowOver16Count: 0,
      slowOver50Count: 0,
      slowOver100Count: 0,
    };
  }

  function createDurationBucketMap(keys = []) {
    const out = Object.create(null);
    for (const key of keys) out[String(key)] = createDurationBucket();
    return out;
  }

  function createPointerDownPerfState() {
    return Object.assign(createDurationBucket(), {
      beforeBootCount: 0,
      afterBootCount: 0,
      lastAt: 0,
      lastTargetType: '',
      lastActionType: '',
      targetType: createDurationBucketMap([
        'answerButton',
        'questionButton',
        'pageDividerLabel',
        'background',
        'unknown',
      ]),
      actionType: createDurationBucketMap([
        'noOp',
        'jumpOrScroll',
        'directUiRefresh',
        'rebuildSchedule',
        'structureRecoveryCheck',
      ]),
      branches: Object.create(null),
    });
  }

  function createAutomaticRefreshPerfState() {
    return {
      coreTurnUpdatedTriggerCount: 0,
      coreTurnUpdatedRebuildCount: 0,
      coreTurnUpdatedDedupedCount: 0,
      cooldownDeferredCount: 0,
      cooldownDeferredRebuildCount: 0,
      identityDriftDetectedCount: 0,
      identityDriftRebuildCount: 0,
      identityDriftTrailingCheckCount: 0,
      identityDriftPersistentCount: 0,
      lastCoreTurnUpdatedVersion: 0,
      lastCoreTurnUpdatedTotal: 0,
      lastCoreTurnListTotal: 0,
      lastRenderedMiniMapTotal: 0,
      lastCoreTurnUpdatedAt: 0,
      lastCooldownDeferredReason: '',
      lastCooldownDeferredAt: 0,
      lastIdentityDriftAt: 0,
      lastIdentityDriftVersion: 0,
      lastIdentityDriftTurnNos: [],
      lastIdentityDriftSignature: '',
    };
  }

  function createMiniMapEnginePerfState() {
    return {
      bootCompletedAt: 0,
      rafOnce: {
        requestedCount: 0,
        executedCount: 0,
        coalescedCount: 0,
        lastKey: '',
        lastAt: 0,
        keys: Object.create(null),
      },
      scheduleSyncActive: {
        callCount: 0,
        executedCount: 0,
        coalescedCount: 0,
        lastReason: '',
        lastAt: 0,
        reasons: Object.create(null),
        beforeBoot: { callCount: 0, executedCount: 0, coalescedCount: 0 },
        afterBoot: { callCount: 0, executedCount: 0, coalescedCount: 0 },
      },
      syncActiveExecution: Object.assign(createDurationBucket(), {
        beforeBootCount: 0,
        afterBootCount: 0,
      }),
      wheelGuard: Object.assign(createDurationBucket(), {
        touchstartCount: 0,
        mousedownCount: 0,
        beforeBootCount: 0,
        afterBootCount: 0,
      }),
      rebuild: {
        scheduleCallCount: 0,
        executedCount: 0,
        coalescedCount: 0,
        lastReason: '',
        lastAt: 0,
        reasons: Object.create(null),
        beforeBoot: { scheduleCallCount: 0, executedCount: 0, coalescedCount: 0 },
        afterBoot: { scheduleCallCount: 0, executedCount: 0, coalescedCount: 0 },
        duration: createDurationBucket(),
      },
      structureRecovery: {
        callCount: 0,
        coalescedCount: 0,
        executedCheckCount: 0,
        shellNoButtonsEvents: 0,
        recoveryTriggeredRebuildCount: 0,
        lastReason: '',
        lastAt: 0,
      },
      refreshFromIndexedState: {
        callCount: 0,
        successCount: 0,
        duration: createDurationBucket(),
      },
      automaticRefresh: createAutomaticRefreshPerfState(),
      pointerDown: createPointerDownPerfState(),
    };
  }

  function ensureMiniMapEnginePerfStateShape(target) {
    if (!target || typeof target !== 'object') return target;
    if (!target.pointerDown || typeof target.pointerDown !== 'object') target.pointerDown = createPointerDownPerfState();
    if (!target.pointerDown.targetType || typeof target.pointerDown.targetType !== 'object') target.pointerDown.targetType = Object.create(null);
    if (!target.pointerDown.actionType || typeof target.pointerDown.actionType !== 'object') target.pointerDown.actionType = Object.create(null);
    if (!target.pointerDown.branches || typeof target.pointerDown.branches !== 'object') target.pointerDown.branches = Object.create(null);
    if (!target.automaticRefresh || typeof target.automaticRefresh !== 'object') {
      target.automaticRefresh = createAutomaticRefreshPerfState();
    }
    return target;
  }

  function recordDuration(bucket, msRaw) {
    if (!bucket) return 0;
    const ms = Number(msRaw);
    if (!Number.isFinite(ms) || ms < 0) return 0;
    bucket.count = Number(bucket.count || 0) + 1;
    bucket.totalMs = Number(bucket.totalMs || 0) + ms;
    bucket.maxMs = Math.max(Number(bucket.maxMs || 0), ms);
    if (ms > 4) bucket.slowOver4Count = Number(bucket.slowOver4Count || 0) + 1;
    if (ms > 8) bucket.slowOver8Count = Number(bucket.slowOver8Count || 0) + 1;
    if (ms > 16) bucket.slowOver16Count = Number(bucket.slowOver16Count || 0) + 1;
    if (ms > 50) bucket.slowOver50Count = Number(bucket.slowOver50Count || 0) + 1;
    if (ms > 100) bucket.slowOver100Count = Number(bucket.slowOver100Count || 0) + 1;
    return ms;
  }

  function bumpCounter(obj, key) {
    if (!obj) return 0;
    const k = String(key || '');
    obj[k] = Number(obj[k] || 0) + 1;
    return obj[k];
  }

  function bumpReason(obj, key) {
    const reason = String(key || '').trim() || 'unknown';
    return bumpCounter(obj, reason);
  }

  function currentPerfPhase() {
    return Number(PERF.bootCompletedAt || 0) > 0 ? 'afterBoot' : 'beforeBoot';
  }

  function bumpPhaseCounter(bucket, phase, key) {
    if (!bucket || !bucket[phase]) return 0;
    return bumpCounter(bucket[phase], key);
  }

  function ensureRafOnceKeyBucket(key) {
    const k = String(key || '').trim() || 'unknown';
    const keys = PERF.rafOnce.keys || (PERF.rafOnce.keys = Object.create(null));
    if (!keys[k] || typeof keys[k] !== 'object') {
      keys[k] = {
        requestedCount: 0,
        executedCount: 0,
        coalescedCount: 0,
        lastAt: 0,
      };
    }
    return keys[k];
  }

  function readDurationBucket(bucket) {
    const count = Number(bucket?.count || 0);
    const totalMs = Number(bucket?.totalMs || 0);
    return {
      count,
      totalMs: perfRoundMs(totalMs) ?? 0,
      avgMs: count > 0 ? perfRoundMs(totalMs / count) : null,
      maxMs: count > 0 ? perfRoundMs(bucket?.maxMs || 0) : null,
      slowOver4Count: Number(bucket?.slowOver4Count || 0),
      slowOver8Count: Number(bucket?.slowOver8Count || 0),
      slowOver16Count: Number(bucket?.slowOver16Count || 0),
      slowOver50Count: Number(bucket?.slowOver50Count || 0),
      slowOver100Count: Number(bucket?.slowOver100Count || 0),
    };
  }

  function ensureDurationBucketMapEntry(obj, key) {
    const k = String(key || '').trim() || 'unknown';
    if (!obj[k] || typeof obj[k] !== 'object') obj[k] = createDurationBucket();
    return obj[k];
  }

  function copyDurationBucketMap(obj) {
    const out = Object.create(null);
    for (const key of Object.keys(obj || {})) out[key] = readDurationBucket(obj[key]);
    return out;
  }

  function copyPlainCounts(obj) {
    const out = Object.create(null);
    for (const key of Object.keys(obj || {})) out[key] = Number(obj[key] || 0);
    return out;
  }

  function copyRafOnceKeys(obj) {
    const out = Object.create(null);
    for (const key of Object.keys(obj || {})) {
      const bucket = obj[key] || {};
      out[key] = {
        requestedCount: Number(bucket.requestedCount || 0),
        executedCount: Number(bucket.executedCount || 0),
        coalescedCount: Number(bucket.coalescedCount || 0),
        lastAt: Number(bucket.lastAt || 0),
      };
    }
    return out;
  }

  function copyPhaseCounts(obj) {
    const out = Object.create(null);
    for (const key of Object.keys(obj || {})) out[key] = Number(obj[key] || 0);
    return out;
  }

  function resetMiniMapEnginePerfState(target) {
    if (!target) return target;
    const bootCompletedAt = S.bootDone ? Math.max(0, Number(target.bootCompletedAt || Date.now())) : 0;
    target.bootCompletedAt = bootCompletedAt;
    target.rafOnce = {
      requestedCount: 0,
      executedCount: 0,
      coalescedCount: 0,
      lastKey: '',
      lastAt: 0,
      keys: Object.create(null),
    };
    target.scheduleSyncActive = {
      callCount: 0,
      executedCount: 0,
      coalescedCount: 0,
      lastReason: '',
      lastAt: 0,
      reasons: Object.create(null),
      beforeBoot: { callCount: 0, executedCount: 0, coalescedCount: 0 },
      afterBoot: { callCount: 0, executedCount: 0, coalescedCount: 0 },
    };
    target.syncActiveExecution = Object.assign(createDurationBucket(), {
      beforeBootCount: 0,
      afterBootCount: 0,
    });
    target.wheelGuard = Object.assign(createDurationBucket(), {
      touchstartCount: 0,
      mousedownCount: 0,
      beforeBootCount: 0,
      afterBootCount: 0,
    });
    target.rebuild = {
      scheduleCallCount: 0,
      executedCount: 0,
      coalescedCount: 0,
      lastReason: '',
      lastAt: 0,
      reasons: Object.create(null),
      beforeBoot: { scheduleCallCount: 0, executedCount: 0, coalescedCount: 0 },
      afterBoot: { scheduleCallCount: 0, executedCount: 0, coalescedCount: 0 },
      duration: createDurationBucket(),
    };
    target.structureRecovery = {
      callCount: 0,
      coalescedCount: 0,
      executedCheckCount: 0,
      shellNoButtonsEvents: 0,
      recoveryTriggeredRebuildCount: 0,
      lastReason: '',
      lastAt: 0,
    };
    target.refreshFromIndexedState = {
      callCount: 0,
      successCount: 0,
      duration: createDurationBucket(),
    };
    target.automaticRefresh = createAutomaticRefreshPerfState();
    target.pointerDown = createPointerDownPerfState();
    return target;
  }

  function getMiniMapEnginePerfStats() {
    ensureMiniMapEnginePerfStateShape(PERF);
    const scheduleBucket = PERF.scheduleSyncActive || {};
    const execBucket = PERF.syncActiveExecution || {};
    const wheelBucket = PERF.wheelGuard || {};
    const rebuildBucket = PERF.rebuild || {};
    const recoveryBucket = PERF.structureRecovery || {};
    const refreshBucket = PERF.refreshFromIndexedState || {};
    const automaticRefresh = PERF.automaticRefresh || {};
    const pointerDownBucket = PERF.pointerDown || {};
    return {
      bootCompletedAt: Number(PERF.bootCompletedAt || 0),
      rafOnce: {
        requestedCount: Number(PERF.rafOnce?.requestedCount || 0),
        executedCount: Number(PERF.rafOnce?.executedCount || 0),
        coalescedCount: Number(PERF.rafOnce?.coalescedCount || 0),
        lastKey: String(PERF.rafOnce?.lastKey || ''),
        lastAt: Number(PERF.rafOnce?.lastAt || 0),
        keys: copyRafOnceKeys(PERF.rafOnce?.keys),
      },
      scheduleSyncActive: {
        callCount: Number(scheduleBucket.callCount || 0),
        executedCount: Number(scheduleBucket.executedCount || 0),
        coalescedCount: Number(scheduleBucket.coalescedCount || 0),
        lastReason: String(scheduleBucket.lastReason || ''),
        lastAt: Number(scheduleBucket.lastAt || 0),
        reasons: copyPlainCounts(scheduleBucket.reasons),
        beforeBoot: copyPhaseCounts(scheduleBucket.beforeBoot),
        afterBoot: copyPhaseCounts(scheduleBucket.afterBoot),
      },
      syncActiveExecution: Object.assign(readDurationBucket(execBucket), {
        beforeBootCount: Number(execBucket.beforeBootCount || 0),
        afterBootCount: Number(execBucket.afterBootCount || 0),
      }),
      wheelGuard: Object.assign(readDurationBucket(wheelBucket), {
        touchstartCount: Number(wheelBucket.touchstartCount || 0),
        mousedownCount: Number(wheelBucket.mousedownCount || 0),
        beforeBootCount: Number(wheelBucket.beforeBootCount || 0),
        afterBootCount: Number(wheelBucket.afterBootCount || 0),
      }),
      rebuild: Object.assign({
        scheduleCallCount: Number(rebuildBucket.scheduleCallCount || 0),
        executedCount: Number(rebuildBucket.executedCount || 0),
        coalescedCount: Number(rebuildBucket.coalescedCount || 0),
        lastReason: String(rebuildBucket.lastReason || ''),
        lastAt: Number(rebuildBucket.lastAt || 0),
        reasons: copyPlainCounts(rebuildBucket.reasons),
        beforeBoot: copyPhaseCounts(rebuildBucket.beforeBoot),
        afterBoot: copyPhaseCounts(rebuildBucket.afterBoot),
      }, readDurationBucket(rebuildBucket.duration)),
      structureRecovery: {
        callCount: Number(recoveryBucket.callCount || 0),
        coalescedCount: Number(recoveryBucket.coalescedCount || 0),
        executedCheckCount: Number(recoveryBucket.executedCheckCount || 0),
        shellNoButtonsEvents: Number(recoveryBucket.shellNoButtonsEvents || 0),
        recoveryTriggeredRebuildCount: Number(recoveryBucket.recoveryTriggeredRebuildCount || 0),
        lastReason: String(recoveryBucket.lastReason || ''),
        lastAt: Number(recoveryBucket.lastAt || 0),
      },
      refreshFromIndexedState: Object.assign({
        callCount: Number(refreshBucket.callCount || 0),
        successCount: Number(refreshBucket.successCount || 0),
      }, readDurationBucket(refreshBucket.duration)),
      automaticRefresh: {
        coreTurnUpdatedTriggerCount: Number(automaticRefresh.coreTurnUpdatedTriggerCount || 0),
        coreTurnUpdatedRebuildCount: Number(automaticRefresh.coreTurnUpdatedRebuildCount || 0),
        coreTurnUpdatedDedupedCount: Number(automaticRefresh.coreTurnUpdatedDedupedCount || 0),
        cooldownDeferredCount: Number(automaticRefresh.cooldownDeferredCount || 0),
        cooldownDeferredRebuildCount: Number(automaticRefresh.cooldownDeferredRebuildCount || 0),
        identityDriftDetectedCount: Number(automaticRefresh.identityDriftDetectedCount || 0),
        identityDriftRebuildCount: Number(automaticRefresh.identityDriftRebuildCount || 0),
        identityDriftTrailingCheckCount: Number(automaticRefresh.identityDriftTrailingCheckCount || 0),
        identityDriftPersistentCount: Number(automaticRefresh.identityDriftPersistentCount || 0),
        lastCoreTurnUpdatedVersion: Number(automaticRefresh.lastCoreTurnUpdatedVersion || 0),
        lastCoreTurnUpdatedTotal: Number(automaticRefresh.lastCoreTurnUpdatedTotal || 0),
        lastCoreTurnListTotal: Number(automaticRefresh.lastCoreTurnListTotal || 0),
        lastRenderedMiniMapTotal: Number(automaticRefresh.lastRenderedMiniMapTotal || 0),
        lastCoreTurnUpdatedAt: Number(automaticRefresh.lastCoreTurnUpdatedAt || 0),
        lastCooldownDeferredReason: String(automaticRefresh.lastCooldownDeferredReason || ''),
        lastCooldownDeferredAt: Number(automaticRefresh.lastCooldownDeferredAt || 0),
        lastIdentityDriftAt: Number(automaticRefresh.lastIdentityDriftAt || 0),
        lastIdentityDriftVersion: Number(automaticRefresh.lastIdentityDriftVersion || 0),
        lastIdentityDriftTurnNos: Array.isArray(automaticRefresh.lastIdentityDriftTurnNos)
          ? automaticRefresh.lastIdentityDriftTurnNos.slice(0, 12)
          : [],
        lastIdentityDriftSignature: String(automaticRefresh.lastIdentityDriftSignature || ''),
      },
      pointerDown: Object.assign(readDurationBucket(pointerDownBucket), {
        beforeBootCount: Number(pointerDownBucket.beforeBootCount || 0),
        afterBootCount: Number(pointerDownBucket.afterBootCount || 0),
        lastAt: Number(pointerDownBucket.lastAt || 0),
        lastTargetType: String(pointerDownBucket.lastTargetType || ''),
        lastActionType: String(pointerDownBucket.lastActionType || ''),
        targetType: copyDurationBucketMap(pointerDownBucket.targetType),
        actionType: copyDurationBucketMap(pointerDownBucket.actionType),
        branches: copyDurationBucketMap(pointerDownBucket.branches),
      }),
    };
  }

  function syncViewportPageDivider(core, pageNum, reason = 'scroll') {
    const num = Math.max(0, Number(pageNum || 0) || 0);
    if (!num || typeof core?.centerOnPageDivider !== 'function') {
      S.lastActivePageNum = 0;
      return false;
    }

    const why = String(reason || '').trim();
    const shouldSmooth = !why.startsWith('scroll');
    const shouldRecenter = (
      num !== Number(S.lastActivePageNum || 0)
      || why.includes('pagechanged')
      || why.includes('page-divider')
      || why.includes('settled')
      || why.includes('boot')
      || why.includes('rebuild')
      || why.includes('resize')
    );
    S.lastActivePageNum = num;
    if (!shouldRecenter) return false;

    try { return !!core.centerOnPageDivider(num, { smooth: shouldSmooth }); } catch (e) {
      derr('sync:centerOnPageDivider', e);
      return false;
    }
  }

  function diagAssertNoMainHelpers() {
    const diag = getDiag();
    if (!diag) return;
    const names = [
      ['setActive', 'MiniMapButton'].join(''),
      ['center', 'MiniMapOnId'].join(''),
      ['updateActive', 'MiniMapBtn'].join(''),
      ['updateCounter', 'ToId'].join(''),
      ['updateToggleColor', 'ById'].join(''),
    ];
    try {
      const present = names.filter((n) => typeof TOPW?.[n] === 'function');
      if (present.length) diag.log?.('engine:assert-main-helpers-present', { names: present });
    } catch {}
  }

  function markPlugin() {
    try { TOPW.H2O_MM_ENGINE_PLUGIN = true; } catch {}
    try { TOPW.H2O_MM_ENGINE_VER = ENGINE_VER; } catch {}
  }

  function markReady(ready) {
    try { TOPW.H2O_MM_ENGINE_READY = !!ready; } catch {}
  }

  function getRegs() {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    const SEL = SH?.SEL_ || SH?.registries?.SEL || W?.H2O?.SEL || {};
    const EV = SH?.EV_ || SH?.registries?.EV || W?.H2O?.EV || {};
    return { SEL, EV };
  }

  function q(sel, root = document) {
    try { return sel ? root.querySelector(sel) : null; } catch { return null; }
  }

  function qq(sel, root = document) {
    try { return sel ? Array.from(root.querySelectorAll(sel)) : []; } catch { return []; }
  }

  function markPerfFullScan() {
    S.perfFullScanTick = Number(S.perfFullScanTick || 0) + 1;
  }

  function answersSelector() {
    const { SEL } = getRegs();
    return SEL.ANSWER || 'article[data-message-author-role="assistant"], div[data-message-author-role="assistant"]';
  }

  // FNV-1a-inspired 32-bit hash, base-36 encoded. Mirrors Pagination's stableHash36
  // exactly so that path_<hash> fallback IDs are identical across all modules.
  function stableHash36(input) {
    const str = String(input || '');
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(36);
  }

  function resolveChatId() {
    // Check shared util hook first (may be populated by another H2O module).
    const fromUtil = String(W?.H2O?.util?.getChatId?.() || '').trim();
    if (fromUtil) return fromUtil;
    // Mirror Pagination getChatId() exactly: /c/, /g/, then path_hash fallback.
    // This guarantees Core, Engine, and Pagination all key collapse state on the
    // same identity string for the same chat/GPT/session.
    const path = String(location.pathname || '/');
    const m = path.match(/\/c\/([^/?#]+)/i) || path.match(/\/g\/([^/?#]+)/i);
    if (m && m[1]) {
      try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
    }
    return `path_${stableHash36(`${location.origin}${path}${location.search || ''}`)}`;
  }

  function normalizeBootMode(raw) {
    const mode = String(raw || '').trim().toLowerCase();
    if (mode === BOOT_MODE_CACHE_FIRST) return BOOT_MODE_CACHE_FIRST;
    if (mode === BOOT_MODE_REBUILD_FIRST) return BOOT_MODE_REBUILD_FIRST;
    return BOOT_MODE_REBUILD_FIRST;
  }

  function getBootMode() {
    try {
      const viaUi = MM_ui()?.getBootMode?.();
      if (viaUi != null) return normalizeBootMode(viaUi);
    } catch {}
    return BOOT_MODE_REBUILD_FIRST;
  }

  function currentViewMode() {
    try {
      const mode = TOPW.H2O_MM_SHARED?.get?.()?.api?.views?.getMode?.();
      return String(mode || '').trim();
    } catch {
      return '';
    }
  }

  function mmBtnSelector() {
    const { SEL } = getRegs();
    return SEL.MM_BTN
      || '[data-cgxui="mnmp-btn"], [data-cgxui="mm-btn"], [data-cgxui="mnmp-qbtn"], [data-cgxui="mm-qbtn"]';
  }

  function activeBtnSelector() {
    const { SEL } = getRegs();
    return SEL.MM_BTN_ACTIVE || '[data-cgxui="mnmp-btn"][data-cgxui-state~="active"], [data-cgxui="mm-btn"][data-cgxui-state~="active"], .cgxui-mm-btn.active';
  }

  function btnClassName() {
    return 'cgxui-mm-btn';
  }

  function wrapClassName() {
    return 'cgxui-mm-wrap';
  }

  function convContainer() {
    const { SEL } = getRegs();
    return q(SEL.CONV_TURNS) || q(SEL.MAIN) || document.body;
  }

  function formEl() {
    const { SEL } = getRegs();
    return q(SEL.FORM);
  }

  function minimapPanel() {
    try {
      const { panel } = MM_uiRefs();
      if (panel && panel.isConnected) return panel;
    } catch {}
    const { SEL } = getRegs();
    return q(SEL.MINIMAP) || q(SEL.PANEL) || q('[data-cgxui$="minimap"]');
  }

  function minimapCol() {
    try {
      const { col } = MM_uiRefs();
      if (col && col.isConnected) return col;
    } catch {}
    const { SEL } = getRegs();
    return q(SEL.MM_COL) || q('[data-cgxui="mm-col"]') || q('.cgxui-mm-col');
  }

  function ensureCol() {
    const panel = minimapPanel();
    if (!panel) return null;

    let col = minimapCol();
    if (col) return col;

    col = document.createElement('div');
    col.className = 'cgxui-mm-col';
    col.setAttribute('data-cgxui-owner', 'mnmp');
    col.setAttribute('data-cgxui', 'mm-col');
    panel.appendChild(col);
    return col;
  }

  function setStateToken(el, tok, on) {
    if (!el) return;
    const key = 'data-cgxui-state';
    const cur = String(el.getAttribute(key) || '').trim();
    const set = new Set(cur ? cur.split(/\s+/).filter(Boolean) : []);
    if (on) set.add(tok); else set.delete(tok);
    if (set.size) el.setAttribute(key, Array.from(set).join(' '));
    else el.removeAttribute(key);
  }

  function selectMiniBtnById(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    try {
      const esc = (window.CSS?.escape) ? CSS.escape(key) : key.replace(/"/g, '\\"');
      return q(`[data-cgxui="mnmp-btn"][data-id="${esc}"]`)
        || q(`[data-cgxui="mnmp-btn"][data-turn-id="${esc}"]`)
        || q(`[data-cgxui="mnmp-btn"][data-primary-a-id="${esc}"]`)
        || q(`[data-cgxui="mm-btn"][data-id="${esc}"]`)
        || q(`[data-cgxui="mm-btn"][data-turn-id="${esc}"]`)
        || q(`[data-cgxui="mm-btn"][data-primary-a-id="${esc}"]`)
        || null;
    } catch {
      return null;
    }
  }

  function internalSetActiveClass(btnId, opts = null) {
    const id = String(btnId || '').trim();
    if (!id) return false;
    const scanTick0 = Number(S.perfFullScanTick || 0);
    // Invariant: regular runtime uses Core.setActive; local fallback is repair-only.
    const core = MM_core();
    if (core && typeof core.setActive === 'function') {
      try { core.setActive(id, 'engine'); } catch {}
      S.lastActiveTurnId = id;
      S.lastActiveBtnId = id;
      try { S.lastActiveBtnEl = core.getBtnById?.(id) || S.lastActiveBtnEl || null; } catch {}
      if (PERF_ASSERT_ON) console.assert(scanTick0 === Number(S.perfFullScanTick || 0), '[MiniMap] Active path must be O(1) — no full scans');
      return true;
    }
    if (!opts?.repair) return false;
    const nextBtn = findBtnById(id, { repair: true });
    if (!nextBtn) return false;
    let prevBtn = findBtnById(S.lastActiveBtnId || S.lastActiveTurnId, { repair: true });
    if (!prevBtn || !prevBtn.isConnected) prevBtn = q(activeBtnSelector());
    if (prevBtn && prevBtn !== nextBtn) {
      prevBtn.classList.remove('active', 'inview');
      setStateToken(prevBtn, 'active', false);
      setStateToken(prevBtn, 'inview', false);
      prevBtn.removeAttribute('data-cgxui-inview');
    }
    nextBtn.classList.add('active', 'inview');
    setStateToken(nextBtn, 'active', true);
    setStateToken(nextBtn, 'inview', true);
    nextBtn.setAttribute('data-cgxui-inview', '1');
    S.lastActiveTurnId = id;
    S.lastActiveBtnId = id;
    S.lastActiveBtnEl = nextBtn;
    if (PERF_ASSERT_ON) console.assert(scanTick0 === Number(S.perfFullScanTick || 0), '[MiniMap] Active path must be O(1) — no full scans');
    return true;
  }

  function normalizeNavId(raw) {
    return String(raw || '').replace(/^conversation-turn-/, '').trim();
  }

  function buildIdVariants(...inputs) {
    const out = new Set();
    const push = (raw) => {
      const id = normalizeNavId(raw);
      if (!id) return;

      out.add(id);

      if (id.startsWith('turn:a:')) {
        const bare = normalizeNavId(id.slice(7));
        if (bare) {
          out.add(bare);
          out.add(`turn:${bare}`);
        }
        return;
      }

      if (id.startsWith('turn:')) {
        const bare = normalizeNavId(id.slice(5));
        if (bare) out.add(bare);
        return;
      }

      out.add(`turn:${id}`);
    };

    for (const value of inputs.flat(Infinity)) push(value);
    return Array.from(out);
  }

  function normalizeAssistantEl(el) {
    if (!el) return null;
    try {
      const role = String(el.getAttribute?.('data-message-author-role') || '').toLowerCase();
      if (role === 'assistant') return el;
    } catch {}
    try {
      const nested = el.querySelector?.('[data-message-author-role="assistant"]');
      if (nested) return nested;
    } catch {}
    try {
      const up = el.closest?.('[data-message-author-role="assistant"]');
      if (up) return up;
    } catch {}
    return el;
  }

  function normalizeQuestionEl(el) {
    if (!el) return null;
    try {
      const role = String(el.getAttribute?.('data-message-author-role') || '').toLowerCase();
      if (role === 'user') return el;
    } catch {}
    try {
      const nested = el.querySelector?.('[data-message-author-role="user"]');
      if (nested) return nested;
    } catch {}
    try {
      const up = el.closest?.('[data-message-author-role="user"]');
      if (up) return up;
    } catch {}
    return null;
  }

  function getTurnHostEl(el) {
    if (!el) return null;
    try {
      return el.closest?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn"]') || null;
    } catch {
      return null;
    }
  }

  function findTurnHostById(anyId) {
    const variants = buildIdVariants(anyId);
    for (const variant of variants) {
      if (!variant) continue;
      try {
        const esc = (window.CSS?.escape) ? CSS.escape(variant) : variant.replace(/"/g, '\\"');
        const el = q(`[data-turn-id="${esc}"]`);
        if (!el) continue;
        return el.closest?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn"]') || el;
      } catch {}
    }
    return null;
  }

  function findAnswerById(answerId) {
    const id = normalizeNavId(answerId);
    if (!id) return null;
    const variants = buildIdVariants(id, `turn:a:${id}`);
    try {
      for (const variant of variants) {
        if (!variant) continue;
        const esc = (window.CSS?.escape) ? CSS.escape(variant) : variant.replace(/"/g, '\\"');
        const el = q(`[data-message-id="${esc}"]`) ||
          q(`[data-cgxui-id="${esc}"]`) ||
          q(`[data-h2o-ans-id="${esc}"]`) ||
          q(`[data-h2o-core-id="${esc}"]`) ||
          q(`[data-turn-id="${esc}"]`);
        if (el) return normalizeAssistantEl(el);
      }
      return null;
    } catch {
      return null;
    }
  }

  const COMPLETE_INDEX_INTERNAL_QIDS = new Set([
    '9111ad43-3734-4120-94fe-a34c9cd3a1cc',
    '3bdfa68f-a197-422a-a3d4-29f028fc6564',
    'e1d4b63f-0be7-4a51-b074-e3372b71d790',
    'aabc4cd2-9a33-4ba0-a721-110e8aa4e25b',
  ]);
  const completeIndexMountedAnchors = new Map();

  function MINI_completeIndexStatus() {
    try {
      const status = W?.H2O?.turnRuntime?.getCompleteTurnIndexProjectionStatus?.();
      return status && typeof status === 'object' ? status : null;
    } catch {
      return null;
    }
  }

  function MINI_callEffectiveTurnRuntime(method) {
    const api = W?.H2O?.turnRuntime || null;
    const name = EFFECTIVE_TURN_RUNTIME_METHOD[method];
    const fn = name ? api?.[name] : null;
    if (typeof fn !== 'function') return null;
    try { return fn.call(api); } catch { return null; }
  }

  function MINI_effectivePresentationStatus() {
    const status = MINI_callEffectiveTurnRuntime('STATUS');
    return status && typeof status === 'object' ? status : null;
  }

  function MINI_completeIndexNavigationEnabled() {
    const status = MINI_completeIndexStatus();
    return status?.enabled === true
      && status?.authoritative === true
      && status?.completenessProof === 'host-payload-full-graph';
  }

  function MINI_completeIndexRouteKey() {
    const status = MINI_completeIndexStatus();
    return `${String(status?.chatId || resolveChatId() || '')}|${String(location.pathname || '')}`;
  }

  function MINI_completeIndexRecords() {
    if (!MINI_completeIndexNavigationEnabled()) return [];
    try {
      const effectiveStatus = MINI_effectivePresentationStatus();
      if (
        effectiveStatus?.overlayActive === true
        && effectiveStatus?.source === 'selected-path-overlay'
      ) {
        const effectiveIndex = MINI_callEffectiveTurnRuntime('INDEX');
        const turns = Array.isArray(effectiveIndex?.turns) ? effectiveIndex.turns : [];
        if (
          effectiveIndex?.complete === true
          && effectiveIndex?.proof === 'selected-path-overlay'
          && turns.length === Number(effectiveStatus?.count || 0)
        ) return turns.slice();
        return [];
      }
      const list = W?.H2O?.turnRuntime?.listTurnRecords?.()
        || W?.H2O?.turnRuntime?.listTurns?.()
        || [];
      return Array.isArray(list) ? list.filter((row) => row?.completeIndexAuthority === true) : [];
    } catch {
      return [];
    }
  }

  /* `records` may be supplied by a caller that already owns the complete
     logical set for this pass. Deriving it here once per descriptor turned a
     single bind pass into one complete-index/status derivation per logical
     record — the O(N) amplification behind the measured storm. The default
     stays identical for every single-descriptor caller. */
  function MINI_completeIndexDescriptor(request = {}, providedRecords = null) {
    const records = Array.isArray(providedRecords) && providedRecords.length
      ? providedRecords
      : MINI_completeIndexRecords();
    if (!records.length) return null;
    const turn = request?.turn || null;
    const normalizeQId = (value) => String(value || '').replace(/^conversation-turn-/, '').replace(/^turn:/, '').trim();
    const qCandidates = Array.from(new Set([
      turn?.qId,
      turn?.questionId,
      request?.questionId,
      request?.qId,
      String(request?.turnId || '').startsWith('turn:') ? request.turnId : '',
    ].map(normalizeQId).filter(Boolean)));
    let record = null;
    for (const qId of qCandidates) {
      record = records.find((row) => String(row?.qId || '') === qId || String(row?.turnId || '') === `turn:${qId}`) || null;
      if (record) break;
    }
    // Once a caller supplies a nonempty product qId, aliases may confirm its
    // anchor but may never rekey it to a different canonical record.
    if (!record && qCandidates.length) return null;

    if (!record) {
      const aliasCandidates = Array.from(new Set([
        turn?.primaryAId,
        turn?.answerId,
        request?.answerId,
        request?.primaryAId,
        request?.id,
      ].map((value) => normalizeNavId(value)).filter(Boolean)));
      const owners = records.filter((row) => {
        const aliases = new Set([
          row?.primaryAId,
          row?.answerId,
          ...(Array.isArray(row?.answerIds) ? row.answerIds : []),
        ].map((value) => normalizeNavId(value)).filter(Boolean));
        return aliasCandidates.some((alias) => aliases.has(alias));
      });
      if (owners.length !== 1) return null;
      record = owners[0];
    }

    const qId = String(record?.qId || '').trim();
    const order = Math.max(0, Number(record?.order || record?.turnNo || record?.idx || 0) || 0);
    if (!qId || !order || COMPLETE_INDEX_INTERNAL_QIDS.has(qId)) return null;
    const answerVariants = Array.from(new Set([
      ...(Array.isArray(record?.answerVariants) ? record.answerVariants : []),
      ...(Array.isArray(record?.answerIds) ? record.answerIds : []),
      record?.primaryAId,
    ].map((value) => normalizeNavId(value)).filter(Boolean)));
    return Object.freeze({
      qId,
      turnId: `turn:${qId}`,
      order,
      total: records.length,
      primaryAId: normalizeNavId(record?.primaryAId || ''),
      answerVariants: Object.freeze(answerVariants),
      noAnswer: record?.noAnswer === true,
      record,
      request,
    });
  }

  function MINI_connectedElement(value) {
    return value?.isConnected ? value : null;
  }

  /* Identity->element resolution goes through the Observer Hub's
     MountRegistry: element references are ephemeral (the host replaces them
     on rematerialization), so the registry is the single writer of the
     binding and a lookup here is an O(1) Map get keyed by the one stable
     host identity, data-message-id. A registry miss means "not mounted right
     now" — never "does not exist" — and costs no DOM probe. The legacy
     document-wide selector probes survive only as the degraded fallback for
     a runtime booted without the hub. */
  function MINI_mountRegistry() {
    try {
      const mounts = (TOPW?.H2O?.obs || W?.H2O?.obs)?.mounts;
      return (mounts && typeof mounts.get === 'function') ? mounts : null;
    } catch { return null; }
  }

  function MINI_mountedElementById(anyId) {
    const mounts = MINI_mountRegistry();
    if (!mounts) return null;
    for (const variant of buildIdVariants(anyId)) {
      // Registry keys are raw data-message-id values; prefixed variants
      // (turn:, turn:a:) can never match and are skipped outright.
      if (!variant || variant.includes(':')) continue;
      try {
        const el = MINI_connectedElement(mounts.get(variant)?.el || null);
        if (el) return el;
      } catch {}
    }
    return null;
  }

  function MINI_resolveCompleteIndexMounted(descriptor, surface = 'answer') {
    if (!descriptor?.qId || COMPLETE_INDEX_INTERNAL_QIDS.has(descriptor.qId)) return null;
    const record = descriptor.record || null;
    const registry = MINI_mountRegistry();
    const liveQuestion = MINI_connectedElement(record?.live?.qEl || record?.qEl || null);
    const exactQuestion = liveQuestion
      || (registry
        ? normalizeQuestionEl(MINI_mountedElementById(descriptor.qId) || MINI_mountedElementById(descriptor.turnId))
        : (normalizeQuestionEl(findTurnHostById(descriptor.qId))
          || normalizeQuestionEl(findTurnHostById(descriptor.turnId))));
    if (exactQuestion) {
      const handle = MINI_hiddenPageHandleForElement(exactQuestion);
      completeIndexMountedAnchors.set(descriptor.qId, exactQuestion);
      return { element: handle || exactQuestion, handle: !!handle, basis: 'qId' };
    }

    // Answer identities are bounded fallback evidence owned by this qId only.
    const aliases = [descriptor.primaryAId, ...descriptor.answerVariants]
      .map((value) => normalizeNavId(value))
      .filter(Boolean);
    for (const alias of Array.from(new Set(aliases))) {
      const answer = registry
        ? normalizeAssistantEl(MINI_mountedElementById(alias))
        : MINI_connectedElement(findAnswerById(alias));
      if (!answer) continue;
      const handle = MINI_hiddenPageHandleForElement(answer);
      completeIndexMountedAnchors.set(descriptor.qId, answer);
      return { element: handle || answer, handle: !!handle, basis: 'owned-answer-alias', alias };
    }
    completeIndexMountedAnchors.delete(descriptor.qId);
    return null;
  }

  function MINI_bindCompleteIndexMountedAnchors() {
    if (!MINI_completeIndexNavigationEnabled()) {
      completeIndexMountedAnchors.clear();
      return 0;
    }
    const records = MINI_completeIndexRecords();
    const liveQIds = new Set(records.map((row) => String(row?.qId || '')).filter(Boolean));
    for (const qId of completeIndexMountedAnchors.keys()) {
      if (!liveQIds.has(qId) || !completeIndexMountedAnchors.get(qId)?.isConnected) completeIndexMountedAnchors.delete(qId);
    }
    for (const record of records) {
      const descriptor = MINI_completeIndexDescriptor({
        qId: record?.qId,
        turnId: record?.turnId,
        turn: record,
      }, records);
      if (descriptor) MINI_resolveCompleteIndexMounted(descriptor, record?.noAnswer ? 'question' : 'answer');
    }
    return completeIndexMountedAnchors.size;
  }

  /* Anchor maintenance driven by MountRegistry deltas.
     A full rebind walks every logical record and probes the document for each
     one that is not mounted; running it on every user-scroll rAF is the O(N)
     amplification this replaces. A mount transition already names exactly
     which identities changed, so only those turns are re-resolved, and the
     work is bounded by the transition batch instead of the logical set.
     Every transition kind resolves the same way on purpose:
     MINI_resolveCompleteIndexMounted rebinds the turn to whatever element is
     currently mounted for it and deletes the binding when nothing is, so
     mounted/replaced establish or update it, unmounted drops it (including a
     disconnected element that would otherwise survive), and a route reset
     clears every incompatible binding before the batch is applied. */
  function MINI_applyMountTransitions(payload) {
    if (!MINI_completeIndexNavigationEnabled()) {
      completeIndexMountedAnchors.clear();
      return 0;
    }
    const transitions = Array.isArray(payload?.transitions) ? payload.transitions : [];
    if (!transitions.length) return 0;
    if (transitions.some((entry) => entry?.type === 'route-reset')) {
      completeIndexMountedAnchors.clear();
    }
    const records = MINI_completeIndexRecords();
    if (!records.length) return 0;
    const recordById = new Map();
    for (const record of records) {
      const ids = [
        record?.qId,
        record?.primaryAId,
        ...(Array.isArray(record?.answerVariants) ? record.answerVariants : []),
        ...(Array.isArray(record?.answerIds) ? record.answerIds : []),
      ];
      for (const raw of ids) {
        const id = normalizeNavId(raw);
        if (id && !recordById.has(id)) recordById.set(id, record);
      }
    }
    const touched = new Set();
    for (const entry of transitions) {
      const record = recordById.get(normalizeNavId(entry?.id));
      const qId = String(record?.qId || '').trim();
      if (!qId || touched.has(qId)) continue;
      touched.add(qId);
      const descriptor = MINI_completeIndexDescriptor({
        qId: record.qId,
        turnId: record.turnId,
        turn: record,
      }, records);
      if (descriptor) MINI_resolveCompleteIndexMounted(descriptor, record?.noAnswer ? 'question' : 'answer');
    }
    return touched.size;
  }

  /* Does this frame still owe a full anchor bootstrap?
     Without a MountRegistry there are no mount deltas to consume, so every
     frame must reconcile exactly as before. With one, a single pass per index
     generation establishes the bindings and MINI_applyMountTransitions keeps
     them current, so the answer is yes once and then no — which is what takes
     the O(N) rebind out of the steady-state scroll path. Lifecycle events
     (route change, complete-index state) clear the flag to re-arm it. */
  function MINI_claimCompleteIndexAnchorBootstrap() {
    if (!MINI_mountRegistry()) return true;
    if (S.completeIndexAnchorsBootstrapped) return false;
    S.completeIndexAnchorsBootstrapped = true;
    return true;
  }

  function MINI_completeIndexScrollRoot() {
    // Seed the ancestor walk from a registry element when available — the
    // registry already knows a mounted turn without a document-wide probe.
    let anyTurn = null;
    try {
      const rec = MINI_mountRegistry()?.all?.()[0] || null;
      anyTurn = MINI_connectedElement(rec?.shell || rec?.el || null);
    } catch {}
    if (!anyTurn) anyTurn = q('[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]');
    let cur = anyTurn?.parentElement || convContainer()?.parentElement || null;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      try {
        const overflowY = String(getComputedStyle(cur)?.overflowY || '');
        if (/^(auto|scroll|overlay)$/.test(overflowY) && cur.scrollHeight > cur.clientHeight + 4) return cur;
      } catch {}
      cur = cur.parentElement;
    }
    return null;
  }

  function MINI_clearActiveScrollRoot() {
    const off = S.offScroll;
    S.offScroll = null;
    S.activeScrollRoot = null;
    try { off?.(); } catch {}
    return true;
  }

  function MINI_bindActiveScrollRoot(reason = 'scroll-root-bind') {
    const nextRoot = MINI_completeIndexScrollRoot() || window;
    if (!nextRoot?.addEventListener || !nextRoot?.removeEventListener) return false;
    if (S.activeScrollRoot === nextRoot && typeof S.offScroll === 'function') return false;

    MINI_clearActiveScrollRoot();
    const opts = { passive: true };
    const onScroll = () => scheduleSyncActive('scroll');
    let removed = false;
    const off = () => {
      if (removed) return;
      removed = true;
      try { nextRoot.removeEventListener('scroll', onScroll, opts); } catch {}
      if (S.activeScrollRoot === nextRoot) S.activeScrollRoot = null;
      if (S.offScroll === off) S.offScroll = null;
    };
    try {
      nextRoot.addEventListener('scroll', onScroll, opts);
    } catch {
      return false;
    }
    S.activeScrollRoot = nextRoot;
    S.offScroll = off;
    scheduleSyncActive(String(reason || 'scroll-root-bind'));
    return true;
  }

  function MINI_moveTowardCompleteIndexTarget(descriptor, hop = 1) {
    if (!descriptor?.order || !descriptor?.total) return false;
    MINI_bindCompleteIndexMountedAnchors();
    const records = MINI_completeIndexRecords();
    const orderByQId = new Map(records.map((row) => [
      String(row?.qId || ''),
      Number(row?.order || row?.turnNo || row?.idx || 0),
    ]));
    const mountedOrders = Array.from(completeIndexMountedAnchors.keys())
      .map((qId) => Number(orderByQId.get(qId) || 0))
      .filter((value) => value > 0);
    const baseFraction = Math.min(1, Math.max(0, (descriptor.order - 0.5) / descriptor.total));
    const root = MINI_completeIndexScrollRoot();
    const maxScroll = root
      ? Math.max(0, Number(root.scrollHeight || 0) - Number(root.clientHeight || 0))
      : Math.max(0, Number(document.documentElement?.scrollHeight || 0) - Number(window.innerHeight || 0));
    const currentTop = root ? Number(root.scrollTop || 0) : Number(window.scrollY || 0);
    const currentFraction = maxScroll > 0 ? Math.min(1, Math.max(0, currentTop / maxScroll)) : baseFraction;
    let fraction = baseFraction;
    if (mountedOrders.length && hop > 1) {
      const nearest = mountedOrders.reduce((best, value) => (
        Math.abs(value - descriptor.order) < Math.abs(best - descriptor.order) ? value : best
      ), mountedOrders[0]);
      const evidenceFraction = Math.min(1, Math.max(0, currentFraction + ((descriptor.order - nearest) / descriptor.total)));
      const evidenceWeight = Math.min(0.8, 0.45 + (hop * 0.08));
      fraction = (baseFraction * (1 - evidenceWeight)) + (evidenceFraction * evidenceWeight);
    }
    try {
      const top = Math.floor(fraction * maxScroll);
      if (root) root.scrollTo({ top, behavior: 'auto' });
      else window.scrollTo({ top, behavior: 'auto' });
      return true;
    } catch {
      return false;
    }
  }

  async function MINI_waitForCompleteIndexMounted(descriptor, surface, timeoutMs, signal) {
    const maxWaitMs = Math.max(80, Number(timeoutMs || COMPLETE_INDEX_NAV_LIMITS.remountWaitMs) || COMPLETE_INDEX_NAV_LIMITS.remountWaitMs);
    if (signal?.aborted) return null;
    const immediate = MINI_resolveCompleteIndexMounted(descriptor, surface);
    if (immediate) return immediate;

    const ownedIds = new Set([
      descriptor?.qId,
      descriptor?.primaryAId,
      ...(Array.isArray(descriptor?.answerVariants) ? descriptor.answerVariants : []),
    ].map((value) => normalizeNavId(value)).filter(Boolean));
    await MINI_awaitMountEvidence(maxWaitMs, (payload) => {
      const transitions = Array.isArray(payload?.transitions) ? payload.transitions : [];
      if (!transitions.length) return false;
      return transitions.some((entry) => entry?.type === 'route-reset' || ownedIds.has(normalizeNavId(entry?.id)));
    });
    if (signal?.aborted) return null;
    return MINI_resolveCompleteIndexMounted(descriptor, surface);
  }

  /* ── Far-target native history materialization ─────────────────────────────
     The host renders only a window of the conversation and loads older turns
     through its own cursor endpoint, ten per round trip. A far MiniMap target
     is reached by repeating the host's own reveal — scroll the conversation to
     its history boundary so ChatGPT issues its next request — while a
     navigation-scoped fetch hook widens only `num_turns` on that one request
     so each cycle covers far more ground. The host keeps ownership of the
     request, its state and its rendering; the hook is inactive by default,
     rewrites at most one request per arm, and disarms on use, route change,
     generation supersession or expiry. Cycles continue only while the
     materialised edge measurably advances and stop with an accurate error
     otherwise. Success is only ever the requested turn, mounted and aligned. */
  const HISTORY_WIDEN_MAX = 50;
  // Measured settle for one widened host reveal (request + render + record
  // binding) runs to ~14s; the grace window covers late binding once per cycle.
  const FAR_NAV_CYCLE_WAIT_MS = 14000;
  const FAR_NAV_LOCAL_WAIT_MS = 6000;
  const FAR_NAV_CYCLE_BUDGET_MS = 19500;
  const FAR_NAV_MAX_CYCLES = 16;
  const historyWiden = {
    armed: false,
    generation: 0,
    routeKey: '',
    chatId: '',
    numTurns: 0,
    hooked: false,
    rewriteCount: 0,
    lastRewrite: null,
    lastDisarmReason: null,
    expiryTimer: 0,
  };

  function MINI_historyWidenMatches(url) {
    if (!historyWiden.armed || !historyWiden.chatId) return null;
    // Ownership is re-verified at rewrite time, not just at arm time: a route
    // change or a newer navigation generation invalidates a pending widening.
    if (historyWiden.routeKey !== MINI_completeIndexRouteKey()) {
      MINI_disarmHistoryWidening('route-changed');
      return null;
    }
    try {
      const status = completeIndexNavigationCoordinator?.getStatus?.();
      if (status && Number(status.generation) !== Number(historyWiden.generation)) {
        MINI_disarmHistoryWidening('generation-superseded');
        return null;
      }
    } catch {}
    let parsed = null;
    try { parsed = new URL(String(url || ''), location.href); } catch { return null; }
    if (parsed.origin !== location.origin) return null;
    // Exactly this conversation's history endpoint, nothing else.
    if (parsed.pathname !== `/backend-api/conversations/${historyWiden.chatId}/messages`) return null;
    const before = parsed.searchParams.get('before');
    const numTurns = parsed.searchParams.get('num_turns');
    if (!before || !numTurns) return null;
    const widened = Math.max(0, Math.min(HISTORY_WIDEN_MAX, Number(historyWiden.numTurns) || 0));
    if (!(widened > (Number(numTurns) || 0))) return null;
    parsed.searchParams.set('num_turns', String(widened));
    return { url: parsed.toString(), from: numTurns, to: String(widened) };
  }

  function MINI_ensureHistoryWidenHook() {
    if (historyWiden.hooked || typeof W.fetch !== 'function') return;
    if (W.fetch.__h2oMiniMapHistoryWiden) { historyWiden.hooked = true; return; }
    const original = W.fetch;
    function h2oMiniMapHistoryWiden(input, init) {
      try {
        if (historyWiden.armed) {
          const raw = (typeof input === 'string' || input instanceof URL)
            ? String(input)
            : (input && typeof input.url === 'string' ? input.url : '');
          const method = String(
            (init && init.method) || (input && input.method) || 'GET',
          ).toUpperCase();
          if (method === 'GET') {
            const match = MINI_historyWidenMatches(raw);
            if (match) {
              historyWiden.rewriteCount += 1;
              historyWiden.lastRewrite = { from: match.from, to: match.to };
              MINI_disarmHistoryWidening('rewritten');
              // Re-issue against the widened URL. A Request instance is rebuilt
              // from itself so credentials/headers/mode carry unchanged.
              const next = (typeof input === 'string' || input instanceof URL)
                ? match.url
                : new Request(match.url, input);
              return original.call(this, next, init);
            }
          }
        }
      } catch (e) {
        derr('farnav:widen-match', e);
      }
      return original.apply(this, arguments);
    }
    h2oMiniMapHistoryWiden.__h2oMiniMapHistoryWiden = true;
    h2oMiniMapHistoryWiden.__h2oOriginalFetch = original;
    historyWiden.hooked = true;
    try { W.fetch = h2oMiniMapHistoryWiden; } catch (e) { derr('farnav:widen-install', e); }
  }

  function MINI_armHistoryWidening(generation, gapTurns) {
    const chatId = String(resolveChatId() || '').trim();
    if (!chatId) return false;
    const gap = Math.max(0, Number(gapTurns) || 0);
    if (!gap) return false;
    MINI_ensureHistoryWidenHook();
    if (!historyWiden.hooked) return false;
    historyWiden.armed = true;
    historyWiden.generation = Number(generation) || 0;
    historyWiden.routeKey = MINI_completeIndexRouteKey();
    historyWiden.chatId = chatId;
    // Enough contiguous history to cover the remaining gap plus margin, bounded
    // by the empirically honored server range. Sizes the network page only —
    // logical membership is never derived from it.
    historyWiden.numTurns = Math.max(10, Math.min(HISTORY_WIDEN_MAX, gap + 5));
    try { clearTimeout(historyWiden.expiryTimer); } catch {}
    // Never outlive its cycle, even if the host issues no request at all.
    historyWiden.expiryTimer = setTimeout(
      () => MINI_disarmHistoryWidening('expired'),
      FAR_NAV_CYCLE_BUDGET_MS,
    );
    return true;
  }

  function MINI_disarmHistoryWidening(reason = 'disarm') {
    try { clearTimeout(historyWiden.expiryTimer); } catch {}
    historyWiden.expiryTimer = 0;
    if (!historyWiden.armed) return false;
    historyWiden.armed = false;
    historyWiden.numTurns = 0;
    historyWiden.lastDisarmReason = String(reason || 'disarm');
    return true;
  }

  function getHistoryWideningStatus() {
    return Object.freeze({
      armed: historyWiden.armed,
      hooked: historyWiden.hooked,
      generation: historyWiden.generation,
      chatId: historyWiden.chatId,
      numTurns: historyWiden.numTurns,
      rewriteCount: historyWiden.rewriteCount,
      lastRewrite: historyWiden.lastRewrite,
      lastDisarmReason: historyWiden.lastDisarmReason,
      lastDriverTrace: Array.isArray(historyWiden.lastDriverTrace)
        ? historyWiden.lastDriverTrace.slice(0, 12)
        : null,
    });
  }

  function MINI_materialisedOrderRange() {
    let oldest = 0;
    let newest = 0;
    try {
      for (const record of MINI_completeIndexRecords()) {
        const el = record?.live?.qEl || record?.live?.primaryAEl || null;
        if (!el || !el.isConnected) continue;
        const order = Math.max(0, Number(record?.turnNo || record?.order) || 0);
        if (!order) continue;
        if (!oldest || order < oldest) oldest = order;
        if (order > newest) newest = order;
      }
    } catch (e) { derr('farnav:range', e); }
    return { oldest, newest };
  }

  function MINI_farNavStatusEl(create = false) {
    const root = document.getElementById('cgx-mm-root');
    if (!root) return null;
    let el = root.querySelector('[data-cgxui="mnmp-farnav-status"]');
    if (!el && create) {
      el = document.createElement('div');
      el.setAttribute('data-cgxui', 'mnmp-farnav-status');
      el.setAttribute('data-cgxui-owner', 'mnmp');
      el.setAttribute('role', 'status');
      el.title = 'Loading history for navigation. Click to cancel.';
      el.style.cssText = 'margin-top:4px;padding:3px 8px;border-radius:8px;'
        + 'font:600 10px/1.3 system-ui,sans-serif;background:rgba(20,20,24,.82);'
        + 'color:#fff;cursor:pointer;text-align:center;user-select:none;';
      el.addEventListener('click', () => {
        try { completeIndexNavigationCoordinator.cancel('user-cancelled'); } catch {}
      });
      root.appendChild(el);
    }
    return el;
  }

  function MINI_showFarNavProgress(generation, text) {
    const el = MINI_farNavStatusEl(true);
    if (!el) return;
    el.dataset.generation = String(generation);
    el.textContent = String(text || '');
  }

  function MINI_clearFarNavProgress(generation = null) {
    const el = MINI_farNavStatusEl(false);
    if (!el) return;
    if (generation !== null && el.dataset.generation !== String(generation)) return;
    try { el.remove(); } catch {}
  }

  /* Materializer evidence reads the MountRegistry: the mounted set is the
     hub's identity->element binding (single writer), so evidence iteration
     scales with the mounted window instead of polling every record's cached
     element for connectivity. The record.live path survives only as the
     no-hub fallback. */
  function MINI_completeIndexOrderById() {
    const byId = new Map();
    try {
      for (const record of MINI_completeIndexRecords()) {
        const order = Math.max(0, Number(record?.turnNo || record?.order) || 0);
        if (!order) continue;
        const qId = normalizeNavId(record?.qId);
        if (qId) byId.set(qId, order);
        const aId = normalizeNavId(record?.primaryAId);
        if (aId) byId.set(aId, order);
        for (const variant of Array.isArray(record?.answerVariants) ? record.answerVariants : []) {
          const id = normalizeNavId(variant);
          if (id && !byId.has(id)) byId.set(id, order);
        }
      }
    } catch (e) { derr('farnav:order-map', e); }
    return byId;
  }

  function MINI_mountedOrderSet() {
    const registry = MINI_mountRegistry();
    if (registry) {
      const orders = [];
      try {
        const byId = MINI_completeIndexOrderById();
        for (const rec of registry.all()) {
          const order = byId.get(String(rec?.id || '')) || 0;
          if (order) orders.push(order);
        }
      } catch (e) { derr('farnav:orders', e); }
      return orders;
    }
    const orders = [];
    try {
      for (const record of MINI_completeIndexRecords()) {
        const el = record?.live?.qEl || record?.live?.primaryAEl || null;
        if (!el || !el.isConnected) continue;
        const order = Math.max(0, Number(record?.turnNo || record?.order) || 0);
        if (order) orders.push(order);
      }
    } catch (e) { derr('farnav:orders', e); }
    return orders;
  }

  function MINI_mountedElementForOrder(order) {
    const registry = MINI_mountRegistry();
    try {
      for (const record of MINI_completeIndexRecords()) {
        if (Math.max(0, Number(record?.turnNo || record?.order) || 0) !== order) continue;
        if (registry) {
          const el = MINI_mountedElementById(record?.qId)
            || MINI_mountedElementById(record?.primaryAId);
          if (el) return el;
        }
        const el = record?.live?.qEl || record?.live?.primaryAEl || null;
        return el && el.isConnected ? el : null;
      }
    } catch (e) { derr('farnav:anchor-el', e); }
    return null;
  }

  /* Event-driven wait on the registry's typed transitions: resolves on the
     first batch the caller accepts, or on timeout. The timeout tick covers
     the measured starved-hydration case, where nothing binds until the
     viewport moves again. */
  function MINI_awaitMountEvidence(timeoutMs, acceptBatch = null) {
    return new Promise((resolve) => {
      const registry = MINI_mountRegistry();
      const budget = Math.max(60, Number(timeoutMs) || 0);
      if (!registry || typeof registry.onTransitions !== 'function') {
        setTimeout(() => resolve('timeout'), budget);
        return;
      }
      let done = false;
      let off = null;
      let timer = 0;
      const finish = (reason) => {
        if (done) return;
        done = true;
        try { off?.(); } catch {}
        try { clearTimeout(timer); } catch {}
        resolve(reason);
      };
      off = registry.onTransitions('minimap-materializer', (payload) => {
        try {
          if (!acceptBatch || acceptBatch(payload) === true) finish('transitions');
        } catch {}
      });
      timer = setTimeout(() => finish('timeout'), budget);
    });
  }

  function MINI_ensureHistoryRequestObserver() {
    if (historyWiden.requestObserver) return;
    try {
      // The page's resource-timing buffer caps out on a long-lived tab, so
      // entry counts freeze; a live observer keeps counting regardless.
      const observer = new PerformanceObserver((list) => {
        try {
          for (const entry of list.getEntries()) {
            if (/\/backend-api\/conversations\/[^/]+\/messages/.test(String(entry?.name || ''))) {
              historyWiden.observedRequests = (historyWiden.observedRequests || 0) + 1;
            }
          }
        } catch {}
      });
      observer.observe({ type: 'resource', buffered: false });
      historyWiden.requestObserver = observer;
    } catch (e) { derr('farnav:request-observer', e); }
  }

  function MINI_historyRequestCount() {
    MINI_ensureHistoryRequestObserver();
    return Number(historyWiden.observedRequests || 0);
  }

  function MINI_nearestMountedGap(order, orders = MINI_mountedOrderSet()) {
    if (!orders.length) return { gap: Infinity, below: 0, above: 0, min: 0, max: 0 };
    let below = 0;
    let above = 0;
    let gap = Infinity;
    let min = 0;
    let max = 0;
    for (const value of orders) {
      const distance = Math.abs(value - order);
      if (distance < gap) gap = distance;
      if (value < order && value > below) below = value;
      if (value > order && (!above || value < above)) above = value;
      if (!min || value < min) min = value;
      if (value > max) max = value;
    }
    return { gap, below, above, min, max };
  }

  /* The host keeps mounting and settling for a beat after the walk concludes,
     so a verdict taken at the loop boundary reads false failures — the target
     is repeatedly observed mounted and aligned two seconds after an
     "unreachable". One bounded grace re-check at the exact failure boundary
     converts those into honest successes without loosening anything: the
     target is still resolved by canonical identity and still verified. */
  async function MINI_farFailureGrace(order, surface, descriptor, ctl) {
    if (ctl.isStale()) return null;
    // Wake on the registry's next mount batch — the exact signal the late
    // settle produces — instead of a fixed sleep; the timeout keeps the
    // original bounded window.
    await MINI_awaitMountEvidence(2000);
    if (ctl.isStale()) return null;
    const mounted = MINI_resolveCompleteIndexMounted(descriptor, surface)
      || (() => {
        const gap = MINI_nearestMountedGap(order).gap;
        if (gap !== 0) return null;
        const el = MINI_mountedElementForOrder(order);
        return el ? { element: el } : null;
      })();
    return mounted ? { mounted } : null;
  }

  /* P02 lifecycle preservation witness: the former MINI_materializeTarget /
     finishSmoothScroll fallback pair is retired. This canonical-descriptor
     driver is the remaining MiniMap materialization and navigation path. */
  async function MINI_materializeFarTarget(descriptor, surface, ctl) {
    const order = Math.max(0, Number(descriptor?.order) || 0);
    const total = Math.max(1, Number(descriptor?.total) || 1);
    if (!order) return null;
    let startOrders = MINI_mountedOrderSet();
    // Right after a load the records bind their live elements a beat later
    // than the MiniMap becomes clickable; give binding a short window before
    // concluding there is no evidence.
    for (let i = 0; i < 10 && !startOrders.length; i += 1) {
      if (ctl.isStale()) return null;
      await new Promise((resolve) => setTimeout(resolve, 300));
      startOrders = MINI_mountedOrderSet();
    }
    // With no bound evidence at all, the bounded hop walk keeps ownership.
    if (!startOrders.length) return null;
    const generation = Number(ctl?.operation?.generation || 0);
    const rewritesBefore = historyWiden.rewriteCount;
    const startGap = MINI_nearestMountedGap(order, startOrders).gap;
    // The viewport walk advances one to four turns per cycle depending on turn
    // heights, so the ceiling scales generously with distance; cycles that make
    // progress break early, and the stall counter ends stuck runs long before
    // the ceiling does.
    const maxCycles = Math.min(FAR_NAV_MAX_CYCLES, Math.ceil(startGap / 2) + 4);
    // Hard watchdog derived from the measured per-cycle host cost, capped so a
    // pathological run can never hold the coordinator for minutes.
    try { ctl.extendDeadline(Math.min(120000, (maxCycles * FAR_NAV_CYCLE_BUDGET_MS) + 15000)); } catch {}
    let cycles = 0;
    let lastGap = startGap;
    let stallCycles = 0;
    // Which neighbour pair the positional anchor was last parked against. A
    // cycle that re-parks on unchanged evidence throws away the distance the
    // previous cycle's sweep covered, so the anchor is only re-applied when
    // the mounted neighbours actually moved.
    let lastAnchorKey = '';
    // Bindings flicker as the host re-windows, so a momentarily absent
    // neighbor must not be mistaken for never-loaded history. The loaded
    // range only ever grows; track it monotonically and pin a history edge
    // only for targets genuinely beyond it.
    let knownMin = Math.min(...startOrders);
    let knownMax = Math.max(...startOrders);
    const result = (partial) => ({
      attempted: true,
      cycles,
      rewrites: Math.max(0, historyWiden.rewriteCount - rewritesBefore),
      ...partial,
    });
    const trace = [];
    historyWiden.lastDriverTrace = trace;
    try {
      MINI_showFarNavProgress(generation, `Loading turn ${order}…`);
      while (cycles < maxCycles) {
        if (ctl.isStale()) return result({ errorCode: 'cancelled' });
        cycles += 1;
        const near = MINI_nearestMountedGap(order);
        const traceRow = {
          c: cycles,
          below: near.below,
          above: near.above,
          gap: near.gap,
          stale: '',
        };
        trace.push(traceRow);
        // Direction per cycle from live evidence: everything mounted sits after
        // the target → the host must load older history (widened). Everything
        // before it → reveal newer. A mid-window gap needs the host viewport
        // moved near the target's proportional position so it renders there.
        if (near.min) knownMin = Math.min(knownMin, near.min);
        if (near.max) knownMax = Math.max(knownMax, near.max);
        const mode = order < knownMin ? 'older' : (order > knownMax ? 'newer' : 'positional');
        const guardToken = armPageJumpGuard(FAR_NAV_CYCLE_BUDGET_MS, 'farnav');
        if (mode === 'older') MINI_armHistoryWidening(generation, Math.max(1, near.above - order));
        const requestsBefore = MINI_historyRequestCount();
        try {
          const rootBefore = MINI_completeIndexScrollRoot();
          traceRow.mode = mode;
          traceRow.topB = rootBefore ? Math.round(rootBefore.scrollTop) : null;
          if (mode === 'positional') {
            // Mid-window gap: park the nearest mounted neighbor on the far
            // side of the target at the opposing viewport edge, so the host
            // renders the region the target lives in. Identity-anchored, never
            // turn-by-turn. With neighbors on both sides the NEAREST one wins,
            // by the same rule the sweep below already applies: anchoring on
            // the far neighbor scrolls the viewport clean past the region the
            // previous cycle just revealed, so the host virtualizes it away
            // and every later cycle re-measures the same gap (measured: a
            // 35 -> 10 request anchored on turn 36, teleported to the bottom
            // and oscillated to the cycle ceiling without ever binding).
            const anchorOrder = (near.above && near.below)
              ? ((near.above - order) <= (order - near.below) ? near.above : near.below)
              : (near.above || near.below);
            const anchorEl = MINI_mountedElementForOrder(anchorOrder);
            traceRow.anchor = anchorOrder;
            traceRow.anchorEl = !!anchorEl;
            // Re-park only on fresh evidence. The sweep inside the cycle walks
            // the viewport toward the target; re-parking on an unchanged
            // neighbour pair teleports it straight back to the anchor and the
            // gap can never close across a hole wider than one cycle's sweep
            // (measured: a target 15 turns from its nearest mounted neighbour
            // oscillated anchor->sweep->anchor for twelve cycles at a constant
            // gap and ended at the ceiling). Unchanged evidence means the
            // previous cycle's displacement is the only progress there is —
            // keep it and sweep on from there.
            const anchorKey = `${near.below}:${near.above}`;
            const reAnchor = anchorKey !== lastAnchorKey;
            lastAnchorKey = anchorKey;
            traceRow.reanchor = reAnchor;
            if (anchorEl) {
              // Side is read from the chosen anchor, not from which neighbor
              // merely exists: an anchor above the target parks at the bottom
              // edge so the region above it renders, and vice versa.
              if (reAnchor) anchorEl.scrollIntoView({ block: anchorOrder > order ? 'end' : 'start', behavior: 'auto' });
            } else if (rootBefore) {
              rootBefore.scrollTop = Math.floor(Math.min(1, Math.max(0, (order - 0.5) / total))
                * Math.max(0, Number(rootBefore.scrollHeight || 0) - Number(rootBefore.clientHeight || 0)));
            }
          } else if (rootBefore) {
            // History boundary: park the edge; the settle loop keeps it pinned
            // through the host's post-ingest re-anchor.
            rootBefore.scrollTop = mode === 'older'
              ? 0
              : Math.max(0, Number(rootBefore.scrollHeight || 0) - Number(rootBefore.clientHeight || 0));
          }
          traceRow.topA = rootBefore ? Math.round(rootBefore.scrollTop) : null;
        } catch (e) { traceRow.err = String(e?.message || e).slice(0, 60); derr('farnav:trigger', e); }
        ctl.setState('mounting-target', { hopCount: cycles });
        // Adaptive settle: a neighbor-anchored render binds in ~2s, so poll
        // fast and hand back to the next cycle as soon as the gap moves —
        // idling the full budget lets the host virtualize the progress away
        // again. Only a network cycle (host request in flight) waits long.
        let mounted = null;
        {
          const cycleStart = Date.now();
          const innerBudget = mode === 'older' ? FAR_NAV_CYCLE_WAIT_MS : FAR_NAV_LOCAL_WAIT_MS;
          let progressedAtMs = 0;
          let lastEdgeEventMs = Date.now();
          while ((Date.now() - cycleStart) < innerBudget) {
            if (ctl.isStale()) break;
            const requestedYet = MINI_historyRequestCount() > requestsBefore;
            // The mounted set churns every tick as the host re-windows, so the
            // action is re-decided per tick, not per cycle. With the target
            // outside the loaded range, pin the history boundary — arrival
            // followed by stillness is what fires the host's next (widened)
            // request, and re-pinning defeats the post-ingest re-anchor that
            // would otherwise virtualize the gain away. With neighbors on both
            // sides, hold the nearest one at the opposing viewport edge; each
            // fresh binding immediately steps the viewport closer.
            try {
              const step = MINI_nearestMountedGap(order);
              if (step.min) knownMin = Math.min(knownMin, step.min);
              if (step.max) knownMax = Math.max(knownMax, step.max);
              const pinRoot = MINI_completeIndexScrollRoot();
              if (order < knownMin || order > knownMax) {
                if (pinRoot) {
                  const bottom = Math.max(0, Number(pinRoot.scrollHeight || 0) - Number(pinRoot.clientHeight || 0));
                  const edge = order < knownMin ? 0 : bottom;
                  const atEdge = Math.abs(Number(pinRoot.scrollTop || 0) - edge) <= 2;
                  if (!atEdge) {
                    pinRoot.scrollTop = edge;
                    lastEdgeEventMs = Date.now();
                  } else if (!requestedYet && (Date.now() - lastEdgeEventMs) > 5000) {
                    pinRoot.scrollTop = order < knownMin ? 240 : Math.max(0, bottom - 240);
                    lastEdgeEventMs = Date.now();
                  }
                }
              } else if (pinRoot) {
                // The host hydrates message identity only while the viewport
                // actually moves, so a parked anchor starves the region and
                // nothing new ever binds. Sweep steadily toward the target
                // instead — natural-scroll-sized steps every tick — and let
                // bindings picked up along the way shrink the gap; the next
                // cycle re-anchors precisely from whatever bound closest.
                const stepOrder = step.above && step.below
                  ? ((step.above - order) <= (order - step.below) ? step.above : step.below)
                  : (step.above || step.below);
                const upward = stepOrder > order;
                const stride = Math.max(240, Math.floor(Number(pinRoot.clientHeight || 800) * 0.55));
                const bottom = Math.max(0, Number(pinRoot.scrollHeight || 0) - Number(pinRoot.clientHeight || 0));
                pinRoot.scrollTop = Math.min(bottom, Math.max(0,
                  Number(pinRoot.scrollTop || 0) + (upward ? -stride : stride)));
              }
            } catch {}
            mounted = MINI_resolveCompleteIndexMounted(descriptor, surface) || null;
            const gapMid = MINI_nearestMountedGap(order).gap;
            if (!mounted && gapMid === 0) {
              // The target's own record is bound but the requested surface may
              // hydrate later (an answer body can trail its question by
              // seconds). The turn is reached; align on the element that
              // exists — for a turn click that is the turn's beginning anyway.
              const ownEl = MINI_mountedElementForOrder(order);
              if (ownEl) mounted = { element: ownEl };
            }
            if (mounted) break;
            if (gapMid < lastGap && !progressedAtMs) progressedAtMs = Date.now();
            // Local render cycles hand back quickly so the next cycle can
            // re-anchor closer; a network cycle holds its window open so the
            // host's request/ingest is never starved by an early break.
            const canBreakEarly = mode !== 'older' || requestedYet;
            if (canBreakEarly && progressedAtMs && (Date.now() - progressedAtMs) > 900) break;
            // Registry transitions are the wake signal: the loop reacts the
            // moment the host mounts, replaces, or unmounts turn elements
            // instead of polling on a hot timer; the timeout tick keeps the
            // viewport-movement trigger alive through starved stretches.
            await MINI_awaitMountEvidence(1100);
          }
        }
        cancelPageJumpGuard(guardToken);
        MINI_disarmHistoryWidening('cycle-complete');
        if (ctl.isStale()) return result({ errorCode: 'cancelled' });
        if (mounted) return result({ mounted });
        const gapNow = MINI_nearestMountedGap(order).gap;
        // A cycle whose host request is still being ingested must not be judged
        // stalled — its progress lands in the next cycle's measurement. Only a
        // cycle with neither gap movement nor a request fails here.
        const requestedThisCycle = MINI_historyRequestCount() > requestsBefore;
        traceRow.g1 = gapNow;
        traceRow.req = requestedThisCycle;
        traceRow.topEnd = (() => { try { const r = MINI_completeIndexScrollRoot(); return r ? Math.round(r.scrollTop) : null; } catch { return null; } })();
        // The mounted set churns while the host re-windows and sweep-driven
        // bindings jitter, so short tied stretches are normal recovery. The
        // nearest-gap metric also freezes while the sweep crosses a turn
        // taller than the viewport, so real scroll displacement counts as
        // progress too. Three consecutive cycles with none of gap movement,
        // displacement or a host request is a real stall.
        const topDelta = (traceRow.topEnd != null && traceRow.topA != null)
          ? Math.abs(Number(traceRow.topEnd) - Number(traceRow.topA))
          : 0;
        const viewportH = (() => {
          try { return Number(MINI_completeIndexScrollRoot()?.clientHeight || 800); } catch { return 800; }
        })();
        const movedEnough = topDelta >= Math.floor(viewportH * 0.6);
        if (gapNow < lastGap || requestedThisCycle || movedEnough) stallCycles = 0;
        else stallCycles += 1;
        if (stallCycles >= 3) {
          return result(await MINI_farFailureGrace(order, surface, descriptor, ctl)
            || { errorCode: 'no-progress' });
        }
        MINI_showFarNavProgress(generation, `History ${gapNow} turns away…`);
        lastGap = Math.min(lastGap, gapNow);
      }
      return result(await MINI_farFailureGrace(order, surface, descriptor, ctl)
        || { errorCode: 'materialization-ceiling' });
    } finally {
      MINI_disarmHistoryWidening('driver-exit');
      MINI_clearFarNavProgress(generation);
    }
  }

  /* Far completions align the requested turn at the start of the usable
     viewport and verify it, allowing one bounded correction after late host
     layout. Near-target navigation keeps its established centering. */
  async function MINI_alignFarTarget(mounted, descriptor, surface) {
    const el = mounted?.element || null;
    if (!el || !el.isConnected) return false;
    const INSET = 48;
    const root = MINI_completeIndexScrollRoot();
    // Direct delta scroll: the shared 'start' path derives its offset from the
    // target's own height, which overshoots badly on turns taller than the
    // viewport. rect.top minus the usable inset is exact regardless of height.
    const alignOnce = () => {
      const rect = el.getBoundingClientRect();
      const delta = rect.top - INSET;
      if (root) root.scrollTop = Math.max(0, Number(root.scrollTop || 0) + delta);
      else W.scrollBy({ top: delta, behavior: 'auto' });
    };
    const measure = () => {
      try {
        const rect = el.getBoundingClientRect();
        return { top: Math.round(rect.top), ok: rect.height > 0 && rect.top >= -8 && rect.top <= 240 };
      } catch { return { top: null, ok: false }; }
    };
    // The walk leaves the host re-laying-out for seconds — late images and
    // hydration above the target shift it in both directions, so any single
    // read lies. Own the whole settle window: re-correct on every out-of-band
    // read, require three consecutive in-band reads, then hold through one
    // more beat and spend a final correction on any late drift.
    let corrections = 0;
    let inBandStreak = 0;
    const deadline = Date.now() + 6500;
    try { alignOnce(); corrections += 1; } catch (e) { derr('farnav:align', e); return false; }
    while (Date.now() < deadline && el.isConnected) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const state = measure();
      if (state.ok) {
        inBandStreak += 1;
        if (inBandStreak >= 3) {
          await new Promise((resolve) => setTimeout(resolve, 1400));
          const settled = measure();
          if (settled.ok || !el.isConnected) return settled.ok && el.isConnected;
          try { alignOnce(); } catch { return false; }
          await new Promise((resolve) => setTimeout(resolve, 600));
          return measure().ok && el.isConnected;
        }
        continue;
      }
      inBandStreak = 0;
      if (corrections >= 6) break;
      try { alignOnce(); corrections += 1; } catch { return false; }
    }
    if (inBandStreak >= 3 && el.isConnected) return true;
    // Same boundary hazard as the driver: the reading that failed is often one
    // settle-beat early. A final grace measure decides, with no correction.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return measure().ok && el.isConnected;
  }

  const completeIndexNavigationCoordinator = createCompleteIndexNavigationCoordinator({
    isEnabled: MINI_completeIndexNavigationEnabled,
    routeKey: MINI_completeIndexRouteKey,
    describeTarget: MINI_completeIndexDescriptor,
    resolveMounted: MINI_resolveCompleteIndexMounted,
    materializeFar: MINI_materializeFarTarget,
    alignFar: MINI_alignFarTarget,
    moveToward: MINI_moveTowardCompleteIndexTarget,
    waitForMounted: MINI_waitForCompleteIndexMounted,
    navigateMounted: (mounted, descriptor, surface) => {
      const target = mounted?.element || null;
      if (!target) return false;
      if (mounted?.handle) return scrollPageToTarget(target, true, 'center');
      return MINI_scrollToResolvedTarget(target, {
        ...(descriptor?.request || {}),
        qId: descriptor.qId,
        questionId: descriptor.qId,
        turnId: descriptor.turnId,
        answerId: descriptor.primaryAId,
        turn: descriptor.record,
      }, surface);
    },
    AbortController: W.AbortController,
  });

  function getCompleteIndexNavigationStatus() {
    return completeIndexNavigationCoordinator.getStatus();
  }

  function MINI_scrollToResolvedTarget(target, ctx, surface = 'answer') {
    if (!target) return false;
    scrollPageToTarget(target, true, 'center');
    if (surface === 'question') {
      let flashed = false;
      try { flashed = !!MM_core()?.applyTempFlash?.(target, { surface: 'question' }); } catch {}
      if (!flashed) {
        try { W.applyTempFlash?.(target, { surface: 'question' }); } catch {}
      }
    } else {
      let flashed = false;
      try { flashed = !!MM_core()?.flashAnswer?.(target); } catch {}
      if (!flashed) {
        try { flashed = !!W.flashAnswer?.(target); } catch {}
      }
      if (!flashed) {
        try { W.applyTempFlash?.(target); } catch {}
      }
    }
    setActiveTurnId(
      ctx?.turnId || ctx?.id || ctx?.answerId || ctx?.canonicalId || '',
      `turn:${ctx?.gesture || 'click'}:${surface}`,
      { skipPageScroll: true },
    );
    return true;
  }

  // A target that lives inside an H2O-collapsed (page-hidden) page resolves
  // to a display:none element; navigation then goes to that page's divider —
  // the visible restore handle — instead of scrolling to a zero-rect node or
  // failing silently. Navigation only: this never changes chat collapse state.
  function MINI_hiddenPageHandleForElement(el) {
    if (!el?.closest) return null;
    const hiddenHost = el.closest('[data-cgxui-chat-page-hidden="1"]');
    if (!hiddenHost) return null;
    const pageNum = Math.max(0, Number(hiddenHost.getAttribute?.('data-cgxui-chat-page-num') || 0) || 0);
    if (!pageNum) return null;
    const esc = (window.CSS?.escape) ? CSS.escape(String(pageNum)) : String(pageNum);
    return q(`.cgxui-chat-page-divider[data-page-num="${esc}"]`)
      || q(`.cgxui-pgnw-page-divider[data-page-num="${esc}"]`)
      || null;
  }

  function MINI_navigateTurnTarget(ctx, surface = 'answer') {
    return completeIndexNavigationCoordinator.navigate({ ...(ctx || {}), surface })
      .then((result) => ({
        ctx: { ...(ctx || {}), surface },
        target: null,
        materialized: Number(result?.hops || 0) > 0,
        completeIndexHandled: true,
        navigationStatus: String(result?.status || 'unavailable'),
      }));
  }

  function scrollPageToTarget(target, smooth = true, block = 'center') {
    if (!target || !target.isConnected) return false;
    const findScrollableAncestors = (el) => {
      const out = [];
      let cur = el?.parentElement || null;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        try {
          const cs = getComputedStyle(cur);
          const oy = String(cs?.overflowY || '');
          const canScroll = (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && cur.scrollHeight > cur.clientHeight + 4;
          if (canScroll) out.push(cur);
        } catch {}
        cur = cur.parentElement;
      }
      return out;
    };
    const ancestors = findScrollableAncestors(target).filter((el) => !el.closest?.('[data-cgxui-owner="mnmp"]'));
    const byScrollRoot = ancestors.find((el) => el.hasAttribute?.('data-scroll-root')) || null;
    const byTall = ancestors.filter((el) => (el.clientHeight || 0) >= Math.max(240, Math.floor(window.innerHeight * 0.45)));
    const host = byScrollRoot || byTall[byTall.length - 1] || ancestors[ancestors.length - 1] || null;
    try {
      if (host && host !== target) {
        const before = host.scrollTop;
        const hr = host.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        const topInHost = (tr.top - hr.top) + host.scrollTop;
        const targetCenter = topInHost - ((host.clientHeight - tr.height) * (block === 'start' ? 0.08 : 0.5));
        const desiredTop = Math.max(0, Math.floor(targetCenter));
        host.scrollTo({ top: desiredTop, behavior: smooth ? 'smooth' : 'auto' });
        // Keep smooth behavior smooth; force set only for non-smooth paths.
        if (!smooth) {
          setTimeout(() => {
            try {
              if (Math.abs((host.scrollTop || 0) - desiredTop) > 2) host.scrollTop = desiredTop;
            } catch {}
          }, 0);
        }
        if (Math.abs(host.scrollTop - before) > 1) return true;
        if (!smooth) {
          try { host.scrollTop = desiredTop; } catch {}
          if (Math.abs(host.scrollTop - before) > 1) return true;
        }
        return true;
      }
    } catch {}
    try {
      target.scrollIntoView?.({ behavior: smooth ? 'smooth' : 'auto', block });
      return true;
    } catch {}
    try {
      const top = Math.max(0, (target.getBoundingClientRect().top + (window.scrollY || 0)) - 120);
      window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
      return true;
    } catch {
      return false;
    }
  }

  function resetVisibleAnswersObserver() {
    try { S.io?.disconnect?.(); } catch {}
    S.io = null;
    S.ioObserved.clear();
    S.visibleSet.clear();
  }

  function ensureVisibleAnswersObserver() {
    if (S.io) return S.io;
    if (typeof IntersectionObserver !== 'function') {
      S.io = null;
      return null;
    }
    S.io = new IntersectionObserver((entries) => {
      let changed = false;
      for (const e of entries) {
        if (e.isIntersecting) {
          if (!S.visibleSet.has(e.target)) {
            S.visibleSet.add(e.target);
            changed = true;
          }
        } else if (S.visibleSet.delete(e.target)) {
          changed = true;
        }
      }
      if (changed) scheduleSyncActive('intersection');
    }, { root: null, rootMargin: '-120px 0px -40px 0px', threshold: 0 });
    return S.io;
  }

  function pruneObservedAnswers() {
    if (!S.ioObserved.size) return 0;
    const io = S.io;
    let removed = 0;
    for (const el of Array.from(S.ioObserved)) {
      if (el?.isConnected) continue;
      removed += 1;
      try { io?.unobserve?.(el); } catch {}
      S.ioObserved.delete(el);
      S.visibleSet.delete(el);
    }
    return removed;
  }

  function observeVisibleAnswers(answers, opts = {}) {
    if (opts?.reset) resetVisibleAnswersObserver();
    const io = ensureVisibleAnswersObserver();
    if (!io) return;
    const list = (Array.isArray(answers) ? answers : []).filter((el) => !!el && el.isConnected);
    if (opts?.incremental) {
      for (const el of list) {
        if (S.ioObserved.has(el)) continue;
        try { io.observe(el); } catch {}
        S.ioObserved.add(el);
      }
      if (opts?.prune) pruneObservedAnswers();
      return;
    }
    const next = new Set(list);
    for (const el of Array.from(S.ioObserved)) {
      if (next.has(el) && el.isConnected) continue;
      try { io.unobserve(el); } catch {}
      S.ioObserved.delete(el);
      S.visibleSet.delete(el);
    }
    for (const el of next) {
      if (S.ioObserved.has(el)) continue;
      try { io.observe(el); } catch {}
      S.ioObserved.add(el);
    }
    if (opts?.prune !== false) pruneObservedAnswers();
  }

  function currentAnswerEls() {
    const core = MM_core();
    try {
      const coreList = core?.getAnswerList?.();
      if (Array.isArray(coreList)) {
        const connected = coreList.filter((el) => !!el && el.isConnected);
        if (connected.length) return connected;
        const anyDomAnswer = q(answersSelector());
        if (!anyDomAnswer) return [];
      }
    } catch {}
    markPerfFullScan();
    return qq(answersSelector());
  }

  function behaviorApi() {
    try { return MM_behavior() || null; } catch { return null; }
  }

  function behaviorMap() {
    const api = behaviorApi();
    try { return api?.get?.() || api?.defaults?.() || null; } catch { return null; }
  }

  function behaviorBinding(surface, gesture, ev) {
    const api = behaviorApi();
    const map = behaviorMap();
    try { return api?.getBinding?.(surface, gesture, ev, map) || { kind: 'none' }; } catch { return { kind: 'none' }; }
  }

  function ensureChatPageDividerBridgeFromRuntime(force = false) {
    try { MM_core()?.ensureChatPageDividerBridge?.(force); } catch (e) { derr('bridges:chat-page-divider', e); }
  }

  function ensureDelegatedHandlers() {
    if (S.offBtnClick) return;

    const MM = (window.MM = window.MM || {});
    const supportsAuxClick = ('onauxclick' in document);
    const PAGE_DIVIDER_LABEL_SEL = '.cgxui-mm-page-divider-label';
    let lastMidTime = 0;
    let lastMidId = '';
    let midTimer = null;
    let lastTapTs = 0;
    let lastTapId = '';
    let suppressClickUntil = 0;
    let activePointerPerf = null;

    const isQuestionSurfaceBtn = (btn) => {
      if (!btn) return false;
      const ui = String(btn.getAttribute?.('data-cgxui') || '').trim().toLowerCase();
      if (ui === 'mnmp-qbtn' || ui === 'mm-qbtn') return true;
      if (String(btn.dataset?.surfaceRole || '').trim().toLowerCase() === 'question') return true;
      return !!btn.classList?.contains?.('cgxui-mm-qbtn');
    };

    const callWashPalette = (ev, primaryAId, anchorBtnEl = null) => {
      try {
        const SH = TOPW.H2O_MM_SHARED?.get?.();
        if (SH?.util?.mmOpenWashPalette) return !!SH.util.mmOpenWashPalette(ev, primaryAId, anchorBtnEl);
      } catch {}
      try {
        const api = W?.H2O?.MM?.wash;
        if (api && typeof api.openPalette === 'function') {
          api.openPalette(ev, primaryAId, anchorBtnEl);
          return true;
        }
      } catch {}
      return false;
    };

    const openExportMenu = () => {
      const exportBtn =
        document.getElementById('cgxui-xpch-export-btn') ||
        document.querySelector('[data-cgxui="xpch-dl-toggle"][data-cgxui-owner="xpch"]');
      if (exportBtn && typeof exportBtn.click === 'function') {
        try { exportBtn.click(); return true; } catch {}
      }
      return false;
    };

    const isOwnedMiniMapBtn = (btn) => {
      if (!btn) return false;
      try {
        const owner = String(btn.getAttribute?.('data-cgxui-owner') || '').trim();
        if (owner === 'mnmp') return true;
      } catch {}
      try {
        const ui = String(btn.getAttribute?.('data-cgxui') || '').trim();
        if (ui === 'mnmp-btn' || ui === 'mm-btn' || ui === 'mnmp-qbtn' || ui === 'mm-qbtn') return true;
      } catch {}
      try {
        if (btn.classList?.contains?.('cgxui-mm-btn')) return true;
        if (btn.classList?.contains?.('cgxui-mm-qbtn')) return true;
      } catch {}
      return false;
    };

    const getEventElement = (target) => {
      if (target instanceof Element) return target;
      const parent = target?.parentElement || target?.parentNode || null;
      return (parent instanceof Element) ? parent : null;
    };

    const pointerPerfState = () => ensureMiniMapEnginePerfStateShape(PERF).pointerDown;

    const pointerPerfRecordBranch = (label, msRaw) => {
      if (!activePointerPerf || !label) return 0;
      const perfBucket = pointerPerfState();
      return recordDuration(ensureDurationBucketMapEntry(perfBucket.branches, label), msRaw);
    };

    const pointerPerfSetActionType = (type) => {
      if (!activePointerPerf) return String(type || '').trim() || 'noOp';
      const next = String(type || '').trim() || 'noOp';
      if (!activePointerPerf.actionType || activePointerPerf.actionType === 'noOp') {
        activePointerPerf.actionType = next;
      }
      return activePointerPerf.actionType;
    };

    const getOwnedPageDividerLabel = (target) => {
      const el = getEventElement(target);
      if (!el?.closest) return null;
      const label = el.closest(PAGE_DIVIDER_LABEL_SEL);
      if (label) {
        try {
          return label.closest?.('.cgxui-mm-page-divider[data-page-num]') ? label : null;
        } catch {}
      }
      const divider = el.closest?.('.cgxui-mm-page-divider[data-page-num]');
      if (!divider) return null;
      try {
        return divider.querySelector?.(PAGE_DIVIDER_LABEL_SEL) || null;
      } catch {}
      return null;
    };

    const isOwnedPageDividerLabel = (label) => {
      if (!label) return false;
      try {
        if (!label.matches?.(PAGE_DIVIDER_LABEL_SEL)) return false;
        return !!label.closest?.('.cgxui-mm-page-divider[data-page-num]');
      } catch {}
      return false;
    };

    const classifyPointerTarget = (target) => {
      const eventEl = getEventElement(target);
      const pageLabel = getOwnedPageDividerLabel(target);
      if (pageLabel && isOwnedPageDividerLabel(pageLabel)) {
        return { targetType: 'pageDividerLabel', pageLabel, btn: null };
      }
      const btn = eventEl?.closest?.(mmBtnSelector()) || null;
      if (btn && isOwnedMiniMapBtn(btn)) {
        return {
          targetType: isQuestionSurfaceBtn(btn) ? 'questionButton' : 'answerButton',
          pageLabel: null,
          btn,
        };
      }
      const ownedSurface = eventEl?.closest?.('[data-cgxui-owner="mnmp"]') || null;
      if (ownedSurface && isMiniMapOwnedNode(ownedSurface)) {
        return { targetType: 'background', pageLabel: null, btn: null };
      }
      return { targetType: 'unknown', pageLabel: null, btn: null };
    };

    const togglePageCollapseFromDivider = (label, event) => {
      // Resolve page number directly — tolerant of detached or replaced label nodes.
      const pageNum = Math.max(0, Number(
        label?.dataset?.pageNum
        || label?.closest?.('.cgxui-mm-page-divider')?.getAttribute?.('data-page-num')
        || label?.getAttribute?.('data-page-num')
        || 0
      ) || 0);
      if (!pageNum) return false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      suppressClickUntil = performance.now() + 180;
      try {
        // Multi-fallback core resolver: kernel bridge → direct global → custom event.
        const core =
          getCoreSurface() ||
          TOPW?.H2O_MM_CORE_API ||
          W?.H2O_MM_CORE_API ||
          TOPW?.H2O?.MM?.mnmp?.api?.core ||
          null;
        if (core?.toggleMiniMapPageCollapsed) {
          return !!core.toggleMiniMapPageCollapsed(pageNum, '', {
            source: 'minimap-local',
            propagate: false,
          });
        }
        window.dispatchEvent(new CustomEvent('evt:h2o:minimap:toggle-page-collapsed', {
          detail: {
            pageNum,
            source: 'minimap-local',
            propagate: false,
          },
        }));
        return true;
      } catch {
        return false;
      }
    };

    const turnCtx = (btn, gesture, ev) => {
      const surfaceRole = String(btn?.dataset?.surfaceRole || 'answer').trim().toLowerCase() || 'answer';
      const turnIdx = Math.max(0, Number(btn?.dataset?.turnIdx || 0) || 0);
      // Button metadata is request evidence only. MINI_completeIndexDescriptor
      // must map it to one current canonical record before any mount lookup or
      // navigation work can begin.
      const turnId = String(btn?.dataset?.turnId || btn?.dataset?.id || '').trim();
      const answerId = String(btn?.dataset?.primaryAId || '').trim();
      const questionId = String(btn?.dataset?.questionId || '').trim();
      const id = surfaceRole === 'question'
        ? (questionId || turnId || answerId)
        : (answerId || turnId || questionId);
      return {
        surface: 'turn',
        surfaceRole,
        gesture,
        turnIdx,
        turnId,
        answerId,
        questionId,
        id,
        btnEl: btn || null,
        ev,
        sh: TOPW.H2O_MM_SHARED?.get?.() || null,
        core: MM_core(),
        rt: MM_rt(),
        uiRefs: MM_uiRefs(),
      };
    };

    const turnActions = {
      answer: (ctx) => {
        if (!ctx?.id) return false;
        MM.program = true;
        MINI_navigateTurnTarget(ctx, 'answer').then(({ ctx: nextCtx, target, handle, completeIndexHandled, navigationStatus }) => {
          if (completeIndexHandled) {
            if (navigationStatus !== 'navigated') {
              derr('turn:answer:navigate:complete-index', { id: String(ctx?.id || ''), status: navigationStatus });
            }
            return;
          }
          if (!target) {
            derr('turn:answer:navigate:no-target', { id: String(ctx?.id || '') });
            return;
          }
          if (handle) {
            // Target page is collapsed: bring its divider (restore handle)
            // into view. Navigation only — chat collapse state is untouched.
            scrollPageToTarget(target, true, 'center');
            return;
          }
          MINI_scrollToResolvedTarget(target, nextCtx, 'answer');
        }).catch((e) => {
          derr('turn:answer:navigate', e);
        }).finally(() => {
          setTimeout(() => { MM.program = false; }, 160);
        });
        return true;
      },
      question: (ctx) => {
        if (!ctx?.id) return false;
        MM.program = true;
        MINI_navigateTurnTarget(ctx, 'question').then(({ ctx: nextCtx, target, handle, completeIndexHandled, navigationStatus }) => {
          if (completeIndexHandled) {
            if (navigationStatus !== 'navigated') {
              derr('turn:question:navigate:complete-index', { id: String(ctx?.id || ''), status: navigationStatus });
            }
            return;
          }
          if (!target) {
            derr('turn:question:navigate:no-target', { id: String(ctx?.id || '') });
            return;
          }
          if (handle) {
            scrollPageToTarget(target, true, 'center');
            return;
          }
          MINI_scrollToResolvedTarget(target, nextCtx, 'question');
        }).catch((e) => {
          derr('turn:question:navigate', e);
        }).finally(() => {
          setTimeout(() => { MM.program = false; }, 180);
        });
        return true;
      },
      palette: (ctx) => {
        if (!ctx?.answerId && !ctx?.id) return false;
        const rect = ctx.btnEl?.getBoundingClientRect?.();
        const event = ctx.ev || {
          clientX: Math.round((rect?.left || 0) + ((rect?.width || 0) / 2)),
          clientY: Math.round((rect?.top || 0) + ((rect?.height || 0) / 2)),
          preventDefault() {},
          stopPropagation() {},
        };
        return !!callWashPalette(event, ctx.answerId || ctx.id, ctx.btnEl || null);
      },
      titles: (ctx) => {
        try { W.toggleStickyTitlePanel?.(ctx.btnEl || null, ctx.answerId || ctx.id); } catch {}
        return true;
      },
      quick: () => {
        const toggle = MM_uiRefs()?.toggle || q('[data-cgxui="mnmp-toggle"][data-cgxui-owner="mnmp"]');
        if (!toggle) return false;
        try {
          const ev = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1, buttons: 4 });
          try { Object.defineProperty(ev, '__h2oBehaviorSyntheticQuick', { value: true }); } catch {}
          toggle.dispatchEvent(ev);
          return true;
        } catch {
          return false;
        }
      },
      export: () => openExportMenu(),
      auto: () => false,
    };
    const turnActionsCustom = {
      'export.menu.open': () => openExportMenu(),
      'quick.open': (ctx) => turnActions.quick(ctx),
    };

    const resolveTurnBinding = (binding, ctx) => {
      const map = behaviorMap() || {};
      const kind = String(binding?.kind || '').trim();
      if (!kind) return { binding: { kind: 'none' }, fn: null };
      if (kind === 'auto') {
        const defs = behaviorApi()?.defaults?.() || null;
        const next = defs?.turn?.[ctx.gesture] || null;
        const nk = String(next?.kind || '').trim();
        if (!nk || nk === 'auto') return { binding: { kind: 'none' }, fn: null };
        return { binding: next, fn: (nk === 'custom') ? null : (turnActions[nk] || null) };
      }
      if (kind === 'custom') {
        const id = String(binding?.id || '').trim();
        if (!id || typeof turnActionsCustom[id] !== 'function') {
          behaviorApi()?.warnOnce?.(`turn-custom:${ctx.gesture}:${id || 'missing'}`, 'Unknown custom action id; fallback applied.', { gesture: ctx.gesture, id });
          const fbKind = String(map?.customFallback?.kind || 'none').trim();
          const fb = (fbKind === 'none') ? { kind: 'none' } : { kind: fbKind };
          if (fb.kind === 'none') return { binding: fb, fn: null };
          return { binding: fb, fn: turnActions[fb.kind] || null };
        }
        return { binding, fn: turnActionsCustom[id] };
      }
      return { binding, fn: turnActions[kind] || null };
    };

    const normalizeTurnBindingForSurface = (binding, ctx) => {
      const role = String(ctx?.surfaceRole || 'answer').trim().toLowerCase();
      const gesture = String(ctx?.gesture || '').trim().toLowerCase();
      if (role !== 'question') return binding;
      if (gesture !== 'click') return binding;

      return { kind: 'question' };
    };

    const runTurnGesture = (btn, gesture, event) => {
      if (!btn || !isOwnedMiniMapBtn(btn)) return false;

      const ctx = turnCtx(btn, gesture, event);
      if (!ctx.id) return false;
      const gestureKey = String(gesture || '').trim().toLowerCase() || 'click';

      const binding0 = behaviorBinding('turn', gesture, event);
      const binding = normalizeTurnBindingForSurface(binding0, ctx);
      const kind = String(binding?.kind || '').trim();

      if (kind === 'none') {
        const branchT0 = activePointerPerf ? perfNow() : 0;
        if (branchT0) pointerPerfRecordBranch(`runTurnGesture:${gestureKey}:binding:none`, perfNow() - branchT0);
        return false;
      }
      if (kind === 'blocked') {
        const branchT0 = activePointerPerf ? perfNow() : 0;
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (branchT0) pointerPerfRecordBranch(`runTurnGesture:${gestureKey}:binding:blocked`, perfNow() - branchT0);
        return true;
      }

      const resolved = resolveTurnBinding(binding, ctx);
      if (!resolved.fn) {
        const branchT0 = activePointerPerf ? perfNow() : 0;
        behaviorApi()?.warnOnce?.(
          `turn-action:${gesture}:${kind}:${ctx.surfaceRole || 'answer'}`,
          'Turn action unavailable; safe no-op.',
          { gesture, kind, surfaceRole: ctx.surfaceRole || 'answer' }
        );
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (branchT0) pointerPerfRecordBranch(`runTurnGesture:${gestureKey}:action:missing`, perfNow() - branchT0);
        return true;
      }

      const actionKey = (
        resolved.fn === turnActions.answer ? 'answer'
          : resolved.fn === turnActions.question ? 'question'
            : resolved.fn === turnActions.palette ? 'palette'
              : resolved.fn === turnActions.titles ? 'titles'
                : (resolved.fn === turnActions.quick || resolved.fn === turnActionsCustom['quick.open']) ? 'quick'
                  : (resolved.fn === turnActions.export || resolved.fn === turnActionsCustom['export.menu.open']) ? 'export'
                    : (kind || 'unknown')
      );
      const branchLabel = `runTurnGesture:${gestureKey}:action:${actionKey}`;
      const branchT0 = activePointerPerf ? perfNow() : 0;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      try {
        const ok = !!resolved.fn(ctx, binding?.payload || {});
        if (branchT0) pointerPerfRecordBranch(branchLabel, perfNow() - branchT0);
        if (ok) {
          if (actionKey === 'answer' || actionKey === 'question') pointerPerfSetActionType('jumpOrScroll');
          else if (actionKey === 'palette' || actionKey === 'titles' || actionKey === 'quick' || actionKey === 'export') pointerPerfSetActionType('directUiRefresh');
        }
        return ok;
      } catch (e) {
        if (branchT0) pointerPerfRecordBranch(`runTurnGesture:${gestureKey}:error`, perfNow() - branchT0);
        behaviorApi()?.warnOnce?.(
          `turn-action-err:${gesture}:${kind}:${ctx.surfaceRole || 'answer'}`,
          'Turn action failed; safe no-op.',
          { err: String(e?.message || e), surfaceRole: ctx.surfaceRole || 'answer' }
        );
        return false;
      }
    };

    const pointerHandler = (e) => {
      const perfT0 = perfNow();
      const phase = (S.bootDone || Number(PERF.bootCompletedAt || 0) > 0) ? 'afterBoot' : 'beforeBoot';
      const classified = (e.button != null && e.button !== 0)
        ? { targetType: 'unknown', pageLabel: null, btn: null }
        : classifyPointerTarget(e.target);
      activePointerPerf = {
        actionType: 'noOp',
        targetType: classified.targetType,
      };
      try {
        if (e.button != null && e.button !== 0) {
          pointerPerfRecordBranch('pointerHandler:nonLeft', perfNow() - perfT0);
          return;
        }
        const pageLabel = classified.pageLabel;
        if (pageLabel && isOwnedPageDividerLabel(pageLabel)) {
          pointerPerfRecordBranch('pointerHandler:pageDividerEarlyReturn', perfNow() - perfT0);
          return;
        }
        const btn = classified.btn;
        if (!btn || !isOwnedMiniMapBtn(btn)) {
          pointerPerfRecordBranch('pointerHandler:noOwnedButton', perfNow() - perfT0);
          return;
        }

        const id = String(btn.dataset?.id || btn.dataset?.turnId || btn.dataset?.primaryAId || '').trim();
        const now = performance.now();
        const isDouble = !!id && id === lastTapId && (now - lastTapTs) < 360;
        lastTapId = id;
        lastTapTs = now;

        if (isDouble) {
          suppressClickUntil = now + 420;
          runTurnGesture(btn, 'dblclick', e);
          return;
        }
        runTurnGesture(btn, 'click', e);
      } finally {
        const perfBucket = pointerPerfState();
        const totalMs = perfNow() - perfT0;
        const targetType = String(activePointerPerf?.targetType || classified.targetType || 'unknown');
        const actionType = String(activePointerPerf?.actionType || 'noOp');
        recordDuration(perfBucket, totalMs);
        if (phase === 'afterBoot') perfBucket.afterBootCount = Number(perfBucket.afterBootCount || 0) + 1;
        else perfBucket.beforeBootCount = Number(perfBucket.beforeBootCount || 0) + 1;
        perfBucket.lastAt = Date.now();
        perfBucket.lastTargetType = targetType;
        perfBucket.lastActionType = actionType;
        recordDuration(ensureDurationBucketMapEntry(perfBucket.targetType, targetType), totalMs);
        recordDuration(ensureDurationBucketMapEntry(perfBucket.actionType, actionType), totalMs);
        activePointerPerf = null;
      }
    };

    const handler = (e) => {
      if (performance.now() < suppressClickUntil) return;
      const pageLabel = getOwnedPageDividerLabel(e.target);
      if (pageLabel && isOwnedPageDividerLabel(pageLabel)) {
        // A page number is not a canonical turn identity. Page-divider
        // collapse remains logical, but single-click navigation fails closed
        // until a canonical turn descriptor is supplied by its owner.
        e?.preventDefault?.();
        e?.stopPropagation?.();
        return;
      }
      const btn = e.target?.closest?.(mmBtnSelector());
      if (!btn || !isOwnedMiniMapBtn(btn)) return;
      runTurnGesture(btn, 'click', e);
    };

    const dblHandler = (e) => {
      // Resolve the MiniMap page divider container from the event target.
      // Do NOT gate on isOwnedPageDividerLabel — on a fast dblclick the browser
      // can report a slightly different e.target for the dblclick vs the preceding
      // clicks, and any descendant of .cgxui-mm-page-divider is a valid hit target.
      const el = (e.target instanceof Element) ? e.target : (e.target?.parentElement || null);
      if (!el) return;
      const divider = el.closest?.('.cgxui-mm-page-divider[data-page-num]');
      if (!divider) return;
      const pageNum = Math.max(0, Number(divider.getAttribute('data-page-num') || 0) || 0);
      if (!pageNum) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      // Delegate to togglePageCollapseFromDivider using the live divider element
      // so its page-num resolution also uses the container attribute.
      togglePageCollapseFromDivider(divider, e);
    };

    const handleMiddleEvent = (event) => {
      const btn = event?.target?.closest?.(mmBtnSelector());
      if (!btn || event.button !== 1) return;
      if (!btn.closest?.('[data-cgxui$="minimap"]')) return;
      if (isQuestionSurfaceBtn(btn)) return;

      const turnId = String(btn.dataset?.id || btn.dataset?.turnId || '').trim();
      if (!turnId) return;

      const midBinding = behaviorBinding('turn', 'mid', event);
      const dmidBinding = behaviorBinding('turn', 'dmid', event);
      const hasMid = String(midBinding?.kind || 'none') !== 'none';
      const hasDmid = String(dmidBinding?.kind || 'none') !== 'none';
      if (!hasMid && !hasDmid) return;

      // Consume auxclick immediately so other middle-click listeners can't fire a single action
      // before we decide whether this gesture is single-middle or double-middle.
      event.preventDefault();
      event.stopPropagation();

      const now = performance.now();
      const delta = now - lastMidTime;
      const isSame = (turnId === lastMidId);
      lastMidTime = now;
      lastMidId = turnId;

      if (isSame && delta < 280 && hasDmid) {
        if (midTimer) { clearTimeout(midTimer); midTimer = null; }
        runTurnGesture(btn, 'dmid', event);
      } else {
        if (midTimer) { clearTimeout(midTimer); midTimer = null; }
        if (!hasMid) return;
        const rect = btn.getBoundingClientRect?.();
        const clientX = Number.isFinite(event?.clientX) ? event.clientX : Math.round((rect?.left || 0) + ((rect?.width || 0) / 2));
        const clientY = Number.isFinite(event?.clientY) ? event.clientY : Math.round((rect?.top || 0) + ((rect?.height || 0) / 2));
        midTimer = setTimeout(() => {
          midTimer = null;
          const fakeEvt = {
            clientX,
            clientY,
            button: 1,
            shiftKey: !!event?.shiftKey,
            altKey: !!event?.altKey,
            metaKey: !!event?.metaKey,
            preventDefault() {},
            stopPropagation() {},
          };
          runTurnGesture(btn, 'mid', fakeEvt);
        }, 260);
      }
    };

    const suppressMiddleDown = (event) => {
      const btn = event?.target?.closest?.(mmBtnSelector());
      if (!btn || event.button !== 1) return;
      if (!btn.closest?.('[data-cgxui$="minimap"]')) return;
      if (isQuestionSurfaceBtn(btn)) return;
      const b = behaviorBinding('turn', 'mid', event);
      const db = behaviorBinding('turn', 'dmid', event);
      if (String(b?.kind || 'none') === 'none' && String(db?.kind || 'none') === 'none') return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('pointerdown', pointerHandler, true);
    window.addEventListener('click', handler, true);
    window.addEventListener('dblclick', dblHandler, true);
    if (supportsAuxClick) {
      window.addEventListener('mousedown', suppressMiddleDown, true);
      window.addEventListener('auxclick', handleMiddleEvent, true);
    } else {
      window.addEventListener('mousedown', handleMiddleEvent, true);
    }
    S.offBtnClick = () => {
      try { window.removeEventListener('pointerdown', pointerHandler, true); } catch {}
      try { window.removeEventListener('click', handler, true); } catch {}
      try { window.removeEventListener('dblclick', dblHandler, true); } catch {}
      try { window.removeEventListener('mousedown', suppressMiddleDown, true); } catch {}
      try { window.removeEventListener('auxclick', handleMiddleEvent, true); } catch {}
      try { window.removeEventListener('mousedown', handleMiddleEvent, true); } catch {}
      try { if (midTimer) clearTimeout(midTimer); } catch {}
      midTimer = null;
    };
  }

  function emitAnswersScan(reason = 'engine') {
    const { EV } = getRegs();
    const evtName = EV.ANSWERS_SCAN || EVT_ANSWERS_SCAN_FALLBACK;
    try { W.H2O?.bus?.emit?.('answers:scan', { reason }); } catch {}
    try { window.dispatchEvent(new CustomEvent(evtName, { detail: { reason } })); } catch {}
  }

  function findBtnById(id, opts = null) {
    const key = String(id || '').trim();
    if (!key) return null;
    try {
      const btn = MM_core()?.getBtnById?.(key);
      if (btn) return btn;
    } catch {}
    if (!opts?.repair) return null;
    return selectMiniBtnById(key);
  }

  function getActiveTurnId() {
    try {
      const b = q(activeBtnSelector());
      const id = String(b?.dataset?.id || b?.dataset?.turnId || '').trim();
      if (id) return id;
    } catch {}
    return String(S.lastActiveTurnId || '');
  }

  function getTurnIndex(anyId) {
    const core = MM_core();
    const key = String(anyId || getActiveTurnId() || '').trim();
    if (!key || !core) return 0;
    try { return Number(core.getTurnIndex?.(key) || 0); } catch { return 0; }
  }

  function notifyTurnChange(source = 'engine') {
    const id = getActiveTurnId();
    if (!id || id === S.lastActiveTurnId) return;

    S.lastActiveTurnId = id;
    const detail = { activeTurnId: id, source };

    for (const cb of Array.from(S.turnListeners)) {
      try { cb(detail); } catch {}
    }
  }

  function setActiveTurnId(id, source = 'api', opts = {}) {
    const key = normalizeNavId(id);
    if (!key) return false;

    const core = getCoreSurface();
    if (!core) {
      disableScrollSync('set-active:no-core');
      return false;
    }
    S.mmProgram = true;
    const skipPageScroll = !!opts?.skipPageScroll;
    if (!skipPageScroll) {
      completeIndexNavigationCoordinator.navigate({ id: key, turnId: key, answerId: key, surface: 'answer' })
        .catch((e) => derr('setActive:canonical-navigation', e));
    }
    try { core.setActive?.(key, source); } catch (e) { derr('setActive:core.setActive', e); }
    try { core.centerOn?.(key, { force: true, smooth: true, activate: false }); } catch (e) { derr('setActive:core.centerOn', e); }
    try { core.updateCounter?.(key); } catch (e) { derr('setActive:core.updateCounter', e); }
    try { core.updateToggleColor?.(key); } catch (e) { derr('setActive:core.updateToggleColor', e); }
    clearTimeout(S.mmUserTimer);
    S.mmUserTimer = setTimeout(() => { S.mmProgram = false; }, 240);

    S.lastActiveTurnId = key;
    S.lastActiveBtnId = key;
    try { S.lastActiveBtnEl = core.getBtnById?.(key) || S.lastActiveBtnEl || null; } catch {}
    notifyTurnChange(source);
    return true;
  }

  function queueSyncActiveReason(reason = 'scroll') {
    const why = String(reason || 'scroll').trim() || 'scroll';
    S.syncReasons.add(why);
    return why;
  }

  function flushSyncActiveReason() {
    const reasons = Array.from(S.syncReasons || []);
    S.syncReasons.clear();
    if (!reasons.length) return 'scroll';
    const primary = reasons.find((reason) => !String(reason || '').startsWith('scroll')) || reasons[0];
    return [primary].concat(reasons.filter((reason) => reason !== primary)).join('|');
  }

  function scheduleSyncActive(reason = 'scroll') {
    if (!S.running) return false;
    const phase = currentPerfPhase();
    const perfBucket = PERF.scheduleSyncActive;
    const why = queueSyncActiveReason(reason);
    perfBucket.callCount = Number(perfBucket.callCount || 0) + 1;
    perfBucket.lastReason = why;
    perfBucket.lastAt = Date.now();
    bumpReason(perfBucket.reasons, why);
    bumpPhaseCounter(perfBucket, phase, 'callCount');
    if (S.syncQueued) {
      perfBucket.coalescedCount = Number(perfBucket.coalescedCount || 0) + 1;
      bumpPhaseCounter(perfBucket, phase, 'coalescedCount');
      return true;
    }
    S.syncQueued = true;
    const run = () => {
      const execPhase = currentPerfPhase();
      S.syncQueued = false;
      perfBucket.executedCount = Number(perfBucket.executedCount || 0) + 1;
      bumpPhaseCounter(perfBucket, execPhase, 'executedCount');
      const execBucket = PERF.syncActiveExecution;
      if (execPhase === 'afterBoot') execBucket.afterBootCount = Number(execBucket.afterBootCount || 0) + 1;
      else execBucket.beforeBootCount = Number(execBucket.beforeBootCount || 0) + 1;
      const perfT0 = perfNow();
      try {
        syncActive(flushSyncActiveReason());
      } finally {
        recordDuration(execBucket, perfNow() - perfT0);
      }
    };
    const schedule = MM_schedule();
    if (schedule && typeof schedule.rafOnce === 'function') {
      MM_scheduleRafOnce('minimap:sync-active', run);
      return true;
    }
    S.syncRAF = requestAnimationFrame(() => {
      S.syncRAF = 0;
      run();
    });
    return true;
  }

  function syncActive(reason = 'scroll') {
    if (!S.running) return;
    // Anchor binding rebuilds the complete-index projection status once per
    // record and probes the document for every unmounted one, so it is far too
    // expensive to repeat on any frame — during our own programmatic
    // navigation it is also pointless, because the coordinator resolves its
    // target itself. With the MountRegistry present the steady state is
    // maintained from mount transitions (MINI_applyMountTransitions), so this
    // frame path only needs to establish the initial binding once per index
    // generation; lifecycle events below re-arm that bootstrap. Without a
    // registry there are no deltas to consume, so the legacy per-frame
    // reconciliation is preserved exactly as the fallback.
    if (!S.mmProgram) { if (MINI_claimCompleteIndexAnchorBootstrap()) { try { MINI_bindCompleteIndexMountedAnchors(); } catch {} } }
    if (S.scrollSyncDisabled) return;
    if (S.mmUser || S.mmProgram) return;
    const scanTick0 = Number(S.perfFullScanTick || 0);
    try { pruneObservedAnswers(); } catch {}
    const core = getCoreSurface();
    if (!core) {
      disableScrollSync('sync:no-core');
      return;
    }
    let id = '';
    if (typeof core.computeActiveFromViewport !== 'function' || typeof core.setActive !== 'function') {
      disableScrollSync('sync:core-surface-missing');
      return;
    }
    const active = core.computeActiveFromViewport({
      visibleSet: S.visibleSet,
      anchorY: 120,
      turnAnchorY: Math.max(0, Math.floor(window.innerHeight * 0.22)),
    });
    const activePageNum = Math.max(0, Number(active?.activePageNum || 0) || 0);
    id = String(active?.activeTurnId || active?.activeAnswerId || active?.syncedId || '');
    if (id) {
      let nextBtn = null;
      try { nextBtn = core.getBtnById?.(id) || null; } catch {}
      const stateStr = String(nextBtn?.getAttribute?.('data-cgxui-state') || '');
      const alreadyActive = !!(
        nextBtn &&
        (nextBtn.classList?.contains?.('active') || /\bactive\b/.test(stateStr))
      );
      const sameId = id === String(S.lastActiveTurnId || S.lastActiveBtnId || '').trim();
      if (!(sameId && alreadyActive)) {
        try { core.setActive(id, 'scroll-sync'); } catch (e) { derr('sync:setActive', e); }
        const centeredDivider = syncViewportPageDivider(core, activePageNum, reason);
        if (!centeredDivider) {
          try { core.centerOn?.(id, { force: false, smooth: true, activate: false }); } catch (e) { derr('sync:centerOn', e); }
        }
        S.lastActiveTurnId = id;
        S.lastActiveBtnId = id;
        try { S.lastActiveBtnEl = core.getBtnById?.(id) || S.lastActiveBtnEl || null; } catch {}
        if (PERF_ASSERT_ON) console.assert(scanTick0 === Number(S.perfFullScanTick || 0), '[MiniMap] Active path must be O(1) — no full scans');
      } else {
        syncViewportPageDivider(core, activePageNum, reason);
      }
    } else {
      syncViewportPageDivider(core, activePageNum, reason);
    }
    notifyTurnChange(reason);
  }

  function clearMiniMapGuardBindings() {
    try { S.offMmWheel?.(); } catch {}
    try { S.offMmTouchStart?.(); } catch {}
    try { S.offMmMouseDown?.(); } catch {}
    S.offMmWheel = null;
    S.offMmTouchStart = null;
    S.offMmMouseDown = null;
    S.mmScroller = null;
    S.mmUser = false;
    S.mmProgram = false;
    clearTimeout(S.mmUserTimer);
    S.mmUserTimer = null;
  }

  function miniMapScroller() {
    const panel = minimapPanel();
    if (!panel) return null;
    if (S.mmScroller && S.mmScroller.isConnected) return S.mmScroller;
    const { SEL } = getRegs();
    const pick = (sel) => {
      const s = String(sel || '').trim();
      if (!s) return null;
      try { return panel.querySelector(s); } catch { return null; }
    };
    const candidates = [
      pick(SEL.MM_COL),
      pick(SEL.MM_SCROLL),
      pick(SEL.MM_COL_LEGACY),
      pick(SEL.COL_PLAIN),
      panel,
    ].filter(Boolean);
    const found = candidates.find((el) => {
      try {
        return el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'visible';
      } catch {
        return false;
      }
    }) || panel;
    return found;
  }

  function bindMiniMapScrollGuards() {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    const on = SH?.util?.on || ((t, ev, fn, opts) => {
      t?.addEventListener?.(ev, fn, opts);
      return () => { try { t?.removeEventListener?.(ev, fn, opts); } catch {} };
    });
    const scroller = miniMapScroller();
    if (!scroller) return;
    if (scroller === S.mmScroller && S.offMmWheel) return;
    clearMiniMapGuardBindings();
    S.mmScroller = scroller;
    const markUser = (ms) => {
      S.mmUser = true;
      clearTimeout(S.mmUserTimer);
      S.mmUserTimer = setTimeout(() => { S.mmUser = false; }, ms);
    };
    S.offMmWheel = on(scroller, 'wheel', () => {
      const perfBucket = PERF.wheelGuard;
      const phase = currentPerfPhase();
      if (phase === 'afterBoot') perfBucket.afterBootCount = Number(perfBucket.afterBootCount || 0) + 1;
      else perfBucket.beforeBootCount = Number(perfBucket.beforeBootCount || 0) + 1;
      const perfT0 = perfNow();
      try {
        markUser(450);
      } finally {
        recordDuration(perfBucket, perfNow() - perfT0);
      }
    }, { passive: false });
    S.offMmTouchStart = on(scroller, 'touchstart', () => {
      PERF.wheelGuard.touchstartCount = Number(PERF.wheelGuard.touchstartCount || 0) + 1;
      markUser(650);
    }, { passive: false });
    S.offMmMouseDown = on(scroller, 'mousedown', (e) => {
      PERF.wheelGuard.mousedownCount = Number(PERF.wheelGuard.mousedownCount || 0) + 1;
      if (e?.target?.closest?.(mmBtnSelector())) return;
      markUser(450);
    }, { passive: false });
  }

  function refreshFromIndexedState(reason = 'engine:indexed-refresh', opts = {}) {
    const perfBucket = PERF.refreshFromIndexedState;
    perfBucket.callCount = Number(perfBucket.callCount || 0) + 1;
    const perfT0 = perfNow();
    let ok = false;
    try {
      const core = MM_core();
      if (!core) return false;

      const refs = MM_uiRefs();
      const panel = refs?.panel || minimapPanel();
      const col = refs?.col || minimapCol();
      if (!panel?.isConnected || !col?.isConnected) return false;

      if (opts?.reconcileRows) {
        if (typeof core.ensureTurnButtons !== 'function') return false;
        try {
          const out = core.ensureTurnButtons();
          if (!(out instanceof Map)) return false;
        } catch (e) {
          derr('refreshFromIndexedState:ensureTurnButtons', e);
          return false;
        }
      }

      if (buildMissing()) return false;

      const chatId = resolveChatId();
      try { ensureChatPageDividerBridgeFromRuntime(); } catch (e) { derr('refreshFromIndexedState:chatPageDividerBridge', e); }
      try { core.attachVisibleAnswers?.(chatId); } catch (e) { derr('refreshFromIndexedState:attachVisibleAnswers', e); }
      try { observeVisibleAnswers(currentAnswerEls()); } catch (e) { derr('refreshFromIndexedState:observeVisibleAnswers', e); }
      try { MINI_bindActiveScrollRoot('indexed-refresh:scroll-root-bind'); } catch (e) { derr('refreshFromIndexedState:bindActiveScrollRoot', e); }
      try { bindMiniMapScrollGuards(); } catch (e) { derr('refreshFromIndexedState:bindMiniMapScrollGuards', e); }
      scheduleSyncActive(reason);
      ok = true;
      return true;
    } finally {
      if (ok) perfBucket.successCount = Number(perfBucket.successCount || 0) + 1;
      recordDuration(perfBucket.duration, perfNow() - perfT0);
    }
  }

  function rebuildNow(reason = 'engine:rebuildNow') {
    const perfBucket = PERF.rebuild;
    const phase = currentPerfPhase();
    perfBucket.executedCount = Number(perfBucket.executedCount || 0) + 1;
    bumpPhaseCounter(perfBucket, phase, 'executedCount');
    const durationT0 = perfNow();
    const perfT0 = PERF_ASSERT_ON ? performance.now() : 0;
    const scanTick0 = Number(S.perfFullScanTick || 0);
    S.rebuildReason = String(reason || 'engine:rebuildNow');
    try {
      const core = MM_core();
      if (!core) return false;

      let ok = false;
      try {
        const res = core.rebuildNow?.(S.rebuildReason);
        ok = (res && typeof res === 'object') ? !!res.ok : !!res;
      } catch (e) {
        derr('rebuildNow:core', e);
      }

      if (ok) {
        ensureChatPageDividerBridgeFromRuntime();
        try { observeVisibleAnswers(core.getAnswerList?.() || []); } catch {}
        try { MINI_bindActiveScrollRoot('rebuild:scroll-root-bind'); } catch {}
        try { bindMiniMapScrollGuards(); } catch {}
        scheduleSyncActive('rebuild');
      }

      if (PERF_ASSERT_ON) {
        try {
          console.debug('[MiniMap][perf] engine.rebuildNow', {
            reason: S.rebuildReason,
            ok,
            ms: Math.max(0, Number(performance.now() - perfT0).toFixed(2)),
            fullScansDelta: Math.max(0, Number(S.perfFullScanTick || 0) - scanTick0),
            fullScansTotal: Number(S.perfFullScanTick || 0),
          });
        } catch {}
      }

      return ok;
    } finally {
      recordDuration(perfBucket.duration, perfNow() - durationT0);
    }
  }

  function scheduleRebuild(reason = 'engine:rebuild') {
    const perfBucket = PERF.rebuild;
    const phase = currentPerfPhase();
    const why = String(reason || 'engine:rebuild');
    perfBucket.scheduleCallCount = Number(perfBucket.scheduleCallCount || 0) + 1;
    perfBucket.lastReason = why;
    perfBucket.lastAt = Date.now();
    bumpReason(perfBucket.reasons, why);
    bumpPhaseCounter(perfBucket, phase, 'scheduleCallCount');
    S.rebuildReason = why;
    const core = MM_core();
    if (!core) return false;
    const schedule = MM_schedule();
    if (schedule && typeof schedule.isPending === 'function') {
      const pending = !!(schedule.isPending('minimap:rebuild') || schedule.isPending('minimap:rebuild:fallback'));
      if (pending) {
        perfBucket.coalescedCount = Number(perfBucket.coalescedCount || 0) + 1;
        bumpPhaseCounter(perfBucket, phase, 'coalescedCount');
      }
    }
    try { return !!core.scheduleRebuild?.(S.rebuildReason); } catch { return false; }
  }

  function readMiniMapStructureCounts() {
    let turnList = [];
    let turnListTotal = 0;
    try {
      turnList = MM_core()?.getTurnList?.() || [];
      turnListTotal = Array.isArray(turnList) ? turnList.length : 0;
    } catch {}

    let renderedTotal = 0;
    const scope = minimapCol() || minimapPanel() || null;
    try {
      renderedTotal = Number((scope || document).querySelectorAll(mmBtnSelector()).length || 0);
    } catch {}
    let hydratedAnswerTotal = 0;
    let firstVisibleIdentityMatches = true;
    try {
      // The registry already holds the mounted assistant set — read it there
      // (document-ordered) instead of sweeping the host document again.
      const registry = MINI_mountRegistry();
      let hydratedAnswers = null;
      if (registry) {
        hydratedAnswers = registry.all()
          .filter((rec) => rec?.role === 'assistant' && rec?.el?.isConnected)
          .map((rec) => rec.el)
          .sort((a, b) => ((a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1));
      } else {
        hydratedAnswers = Array.from(document.querySelectorAll(answersSelector()));
      }
      hydratedAnswerTotal = hydratedAnswers.length;
      const firstId = String(
        hydratedAnswers[0]?.getAttribute?.('data-message-id')
        || hydratedAnswers[0]?.dataset?.messageId
        || '',
      ).trim();
      if (firstId) {
        firstVisibleIdentityMatches = !!MM_core()?.getTurnById?.(firstId)
          || turnList.some((turn) => {
            const ids = [
              ...(Array.isArray(turn?.answerIds) ? turn.answerIds : []),
              turn?.answerId,
              turn?.primaryAId,
              turn?.aId,
              turn?.id,
            ].map((value) => String(value || '').replace(/^turn:/, ''));
            return ids.includes(firstId);
          });
      }
    } catch {}
    return {
      turnListTotal,
      renderedTotal,
      hydratedAnswerTotal,
      firstVisibleIdentityMatches,
    };
  }

  function readPublishedSyntheticAnswerRows() {
    let rows = [];
    try { rows = MM_core()?.getTurnList?.() || []; } catch { rows = []; }
    const matches = (Array.isArray(rows) ? rows : []).filter((row) => {
      if (String(row?.layer || 'current') === 'history') return false;
      const qId = String(row?.qId || row?.questionId || '').trim();
      const turnId = String(row?.turnId || '').trim();
      if (qId || !turnId.startsWith('turn:a:')) return false;
      const answerId = turnId.slice(7).trim();
      if (!answerId) return false;
      const answerIds = [
        row?.primaryAId,
        row?.answerId,
        ...(Array.isArray(row?.answerIds) ? row.answerIds : []),
      ].map((value) => String(value || '').trim()).filter(Boolean);
      return answerIds.includes(answerId);
    });
    const identities = matches
      .map((row) => String(row?.turnId || '').trim())
      .filter(Boolean)
      .sort()
      .slice(0, 24);
    return {
      count: matches.length,
      signature: matches.length ? `${matches.length}:${identities.join('|')}` : '',
    };
  }

  function readAuthoritativeCoreUniverse(detail = {}) {
    let records = [];
    try {
      records = MINI_completeIndexRecords();
      if (!records.length) {
        const list = W?.H2O?.turnRuntime?.listTurnRecords;
        if (typeof list === 'function') records = list() || [];
      }
    } catch {
      records = [];
    }
    const source = Array.isArray(records) ? records.filter(Boolean) : [];
    let hash = 2166136261;
    const sampled = source.slice(0, 512);
    for (const row of sampled) {
      const token = [
        row?.turnNo || row?.idx || '',
        row?.qId || row?.questionId || '',
        row?.turnId || '',
        row?.primaryAId || row?.answerId || '',
      ].map((value) => String(value || '').trim()).join('|');
      for (let index = 0; index < token.length; index += 1) {
        hash ^= token.charCodeAt(index);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
    }
    const detailTotal = Math.max(0, Number(detail?.turnTotal || 0) || 0);
    const count = source.length || detailTotal;
    return {
      count,
      fingerprint: `${count}:${sampled.length}:${hash.toString(16).padStart(8, '0')}`,
    };
  }

  function readMiniMapIdentityAlignment(opts = {}) {
    let records = [];
    try {
      records = MINI_completeIndexRecords();
      if (!records.length) {
        const list = W?.H2O?.turnRuntime?.listTurnRecords;
        if (typeof list !== 'function') {
          return { available: false, missing: false, reason: 'presentation-records-unavailable', drifts: [] };
        }
        records = list() || [];
      }
      records = records.slice().sort((a, b) => {
        return Number(a?.order || a?.turnNo || a?.idx || 0)
          - Number(b?.order || b?.turnNo || b?.idx || 0);
      });
      if (!records.length) {
        return { available: false, missing: false, reason: 'presentation-records-unavailable', drifts: [] };
      }
    } catch {
      return { available: false, missing: false, reason: 'canonical-records-read-failed', drifts: [] };
    }

    const scope = minimapCol() || minimapPanel() || null;
    if (!scope?.querySelectorAll) {
      return { available: false, missing: false, reason: 'minimap-root-unavailable', drifts: [] };
    }

    let buttons = [];
    try {
      buttons = Array.from(scope.querySelectorAll('[data-cgxui="mnmp-btn"], [data-cgxui="mm-btn"]'));
    } catch {
      return { available: false, missing: false, reason: 'minimap-buttons-read-failed', drifts: [] };
    }

    const buttonsByTurnNo = new Map();
    for (const btn of buttons) {
      const turnNo = Math.max(0, Number(btn?.dataset?.turnIdx || 0) || 0);
      if (!turnNo) continue;
      const bucket = buttonsByTurnNo.get(turnNo) || [];
      bucket.push(btn);
      buttonsByTurnNo.set(turnNo, bucket);
    }

    const core = MM_core();
    const drifts = [];
    const retainedProjection = opts?.allowRetainedProjection === true
      && buttons.length > records.length;
    for (const record of records) {
      const turnNo = Math.max(0, Number(record?.order || record?.turnNo || record?.idx || 0) || 0);
      if (!turnNo) continue;
      const candidates = buttonsByTurnNo.get(turnNo) || [];
      let btn = null;
      let matchedByIdentity = false;
      try {
        btn = core?.getBtnById?.(record?.turnId || record?.qId || '') || null;
        matchedByIdentity = !!btn;
      } catch {}
      if (!btn?.isConnected || !scope.contains(btn)) {
        matchedByIdentity = false;
        btn = candidates.length === 1 ? candidates[0] : null;
      }

      const expectedTurnId = normalizeNavId(record?.turnId || '');
      const expectedQuestionId = normalizeNavId(record?.qId || '');
      const expectedPrimaryAId = normalizeNavId(record?.primaryAId || '');
      const answerIds = Array.isArray(record?.answerIds) ? record.answerIds : [];
      const noAnswer = record?.noAnswer === true
        || (!expectedPrimaryAId && answerIds.length === 0);
      const reasons = [];
      let actualTurnId = '';
      let actualQuestionId = '';
      let actualPrimaryAId = '';
      let actualWrapperPrimaryAId = '';
      let actualQuestionPrimaryAId = '';

      if (!btn) {
        reasons.push(candidates.length > 1 ? 'duplicate-turn-buttons' : 'button-missing');
      } else {
        const wrap = btn.closest?.('[data-cgxui="mnmp-wrap"], [data-cgxui="mm-wrap"], .cgxui-mm-wrap') || null;
        const qBtn = wrap?.querySelector?.('[data-cgxui="mnmp-qbtn"], [data-cgxui="mm-qbtn"]') || null;
        const actualTurnNo = Math.max(0, Number(btn.dataset?.turnIdx || wrap?.dataset?.turnIdx || 0) || 0);
        actualTurnId = normalizeNavId(btn.dataset?.turnId || wrap?.dataset?.turnId || '');
        actualQuestionId = normalizeNavId(
          btn.dataset?.questionId || wrap?.dataset?.questionId || qBtn?.dataset?.questionId || '',
        );
        actualPrimaryAId = normalizeNavId(btn.dataset?.primaryAId || '');
        actualWrapperPrimaryAId = normalizeNavId(wrap?.dataset?.primaryAId || '');
        actualQuestionPrimaryAId = normalizeNavId(qBtn?.dataset?.primaryAId || '');

        if (actualTurnNo !== turnNo && !(retainedProjection && matchedByIdentity)) {
          reasons.push('turn-no-mismatch');
        }
        if (expectedTurnId && actualTurnId !== expectedTurnId) reasons.push('turn-key-mismatch');
        if (expectedQuestionId && actualQuestionId !== expectedQuestionId) reasons.push('question-id-mismatch');
        if (expectedPrimaryAId) {
          if (actualPrimaryAId !== expectedPrimaryAId) reasons.push('primary-id-mismatch');
        } else if (noAnswer && (
          actualPrimaryAId || actualWrapperPrimaryAId || actualQuestionPrimaryAId
        )) {
          reasons.push('no-answer-primary-present');
        }
      }

      if (reasons.length) {
        drifts.push({
          turnNo,
          expectedTurnId,
          actualTurnId,
          expectedQuestionId,
          actualQuestionId,
          expectedPrimaryAId,
          actualPrimaryAId,
          actualWrapperPrimaryAId,
          actualQuestionPrimaryAId,
          reasons,
        });
      }
    }

    return {
      available: true,
      missing: drifts.length > 0,
      reason: drifts.length ? 'identity-drift' : '',
      canonicalCount: records.length,
      renderedCount: buttons.length,
      retainedProjection,
      drifts,
    };
  }

  function buildMiniMapIdentityDriftSignature(version, alignment) {
    const rows = Array.isArray(alignment?.drifts) ? alignment.drifts.slice(0, 12) : [];
    const body = rows.map((row) => {
      return [
        Number(row?.turnNo || 0),
        String(row?.expectedPrimaryAId || ''),
        String(row?.actualPrimaryAId || ''),
        Array.isArray(row?.reasons) ? row.reasons.join('.') : '',
      ].join(':');
    }).join('|');
    return `${Math.max(0, Number(version || 0) || 0)}:${Number(alignment?.drifts?.length || 0)}:${body}`
      .slice(0, 640);
  }

  function noteMiniMapIdentityDrift(version, alignment) {
    const perfBucket = PERF.automaticRefresh;
    const signature = buildMiniMapIdentityDriftSignature(version, alignment);
    perfBucket.lastIdentityDriftAt = Date.now();
    perfBucket.lastIdentityDriftVersion = Math.max(0, Number(version || 0) || 0);
    perfBucket.lastIdentityDriftTurnNos = Array.from(new Set(
      (alignment?.drifts || []).map((row) => Number(row?.turnNo || 0)).filter(Boolean),
    )).slice(0, 12);
    perfBucket.lastIdentityDriftSignature = signature;
    return signature;
  }

  function scheduleIdentityDriftTrailingCheck(version, signature) {
    const nextVersion = Math.max(0, Number(version || 0) || 0);
    const nextSignature = String(signature || '');
    if (nextSignature !== S.identityDriftRecoverySignature) {
      S.identityDriftTrailingRetriedSignature = '';
    }
    S.identityDriftRecoveryVersion = nextVersion;
    S.identityDriftRecoverySignature = nextSignature;

    const run = () => {
      S.identityDriftTrailingTimer = null;
      if (!S.running) return;
      const perfBucket = PERF.automaticRefresh;
      perfBucket.identityDriftTrailingCheckCount = Number(perfBucket.identityDriftTrailingCheckCount || 0) + 1;
      let alignment = null;
      try { alignment = readMiniMapIdentityAlignment({ allowRetainedProjection: true }); } catch {}
      if (!alignment?.available || !alignment.missing) {
        S.identityDriftRecoverySignature = '';
        S.identityDriftTrailingRetriedSignature = '';
        return;
      }

      const currentVersion = Math.max(0, Number(
        W?.H2O?.turn?.version?.()
        || perfBucket.lastCoreTurnUpdatedVersion
        || S.identityDriftRecoveryVersion
        || 0,
      ) || 0);
      const currentSignature = noteMiniMapIdentityDrift(currentVersion, alignment);
      perfBucket.identityDriftPersistentCount = Number(perfBucket.identityDriftPersistentCount || 0) + 1;
      if (currentSignature === S.identityDriftTrailingRetriedSignature) return;
      S.identityDriftTrailingRetriedSignature = currentSignature;
      const scheduled = scheduleRebuild('core:turn-updated:identity-drift:trailing');
      if (scheduled) {
        perfBucket.identityDriftRebuildCount = Number(perfBucket.identityDriftRebuildCount || 0) + 1;
      }
    };

    const delay = MO_REBUILD_COOLDOWN_MS + 40;
    const schedule = MM_schedule();
    if (schedule && typeof schedule.timeoutOnce === 'function') {
      S.identityDriftTrailingTimer = schedule.timeoutOnce('minimap:identity-drift-trailing', delay, run);
      return true;
    }
    if (S.identityDriftTrailingTimer) return true;
    S.identityDriftTrailingTimer = setTimeout(run, delay);
    return true;
  }

  function onCoreTurnUpdated(detail = {}) {
    if (!S.running) return false;
    const perfBucket = PERF.automaticRefresh;
    const version = Math.max(0, Number(detail?.version || 0) || 0);
    const turnTotal = Math.max(0, Number(detail?.turnTotal || 0) || 0);
    const syntheticCurrent = readPublishedSyntheticAnswerRows();
    if (syntheticCurrent.count > 0) {
      const universe = readAuthoritativeCoreUniverse(detail);
      const reconciliationKey = [
        syntheticCurrent.signature,
        `version:${version}`,
        `turns:${turnTotal}`,
        `core:${universe.count}`,
        `fingerprint:${universe.fingerprint}`,
      ].join('|').slice(0, 960);
      if (reconciliationKey === S.syntheticCurrentReconcileSignature) return false;
      S.syntheticCurrentReconcileSignature = reconciliationKey;
      const scheduled = scheduleRebuild('core:turn-updated:synthetic-current-reconcile');
      if (scheduled) {
        perfBucket.coreTurnUpdatedRebuildCount = Number(perfBucket.coreTurnUpdatedRebuildCount || 0) + 1;
      }
      return scheduled;
    }
    S.syntheticCurrentReconcileSignature = '';
    if (version > 0
      && version === Number(perfBucket.lastCoreTurnUpdatedVersion || 0)
      && turnTotal === Number(perfBucket.lastCoreTurnUpdatedTotal || 0)) {
      perfBucket.coreTurnUpdatedDedupedCount = Number(perfBucket.coreTurnUpdatedDedupedCount || 0) + 1;
      return false;
    }

    perfBucket.coreTurnUpdatedTriggerCount = Number(perfBucket.coreTurnUpdatedTriggerCount || 0) + 1;
    perfBucket.lastCoreTurnUpdatedVersion = version;
    perfBucket.lastCoreTurnUpdatedTotal = turnTotal;
    perfBucket.lastCoreTurnUpdatedAt = Date.now();

    const {
      turnListTotal,
      renderedTotal,
      hydratedAnswerTotal,
      firstVisibleIdentityMatches,
    } = readMiniMapStructureCounts();
    perfBucket.lastCoreTurnListTotal = turnListTotal;
    perfBucket.lastRenderedMiniMapTotal = renderedTotal;

    let identityAlignment = null;
    try { identityAlignment = readMiniMapIdentityAlignment({ allowRetainedProjection: true }); } catch {}
    if (identityAlignment?.available && identityAlignment.missing) {
      perfBucket.identityDriftDetectedCount = Number(perfBucket.identityDriftDetectedCount || 0) + 1;
      const signature = noteMiniMapIdentityDrift(version, identityAlignment);
      const scheduled = scheduleRebuild('core:turn-updated:identity-drift');
      if (scheduled) {
        perfBucket.identityDriftRebuildCount = Number(perfBucket.identityDriftRebuildCount || 0) + 1;
      }
      scheduleIdentityDriftTrailingCheck(version, signature);
      return scheduled;
    }

    let cacheDiagnostics = null;
    try { cacheDiagnostics = MM_core()?.getCacheCompletenessDiagnostics?.() || null; } catch {}
    const unresolvedTransientCount = Math.max(0, Number(
      cacheDiagnostics?.unresolvedTransientCount
      ?? cacheDiagnostics?.lastMergeDecision?.unresolvedTransientCount
      ?? 0
    ) || 0);
    const ownerlessTransientCount = Math.max(0, Number(
      cacheDiagnostics?.ownerlessTransientExcludedCount
      ?? cacheDiagnostics?.lastMergeDecision?.ownerlessTransientExcludedCount
      ?? 0
    ) || 0);
    let publishedTransientCount = 0;
    try {
      publishedTransientCount = (MM_core()?.getTurnList?.() || []).filter((row) => (
        String(row?.layer || 'current') !== 'history'
        && String(row?.currentProof || '') === 'transient-unverified'
      )).length;
    } catch {}
    if (
      turnListTotal > turnTotal
      && (unresolvedTransientCount || ownerlessTransientCount || publishedTransientCount)
    ) {
      const scheduled = scheduleRebuild('core:turn-updated:transient-reconcile');
      if (scheduled) {
        perfBucket.coreTurnUpdatedRebuildCount = Number(perfBucket.coreTurnUpdatedRebuildCount || 0) + 1;
      }
      return scheduled;
    }

    let missing = false;
    try { missing = buildMissing(); } catch {}
    const retainedCacheProjection = turnTotal > 0
      && turnListTotal > turnTotal
      && turnListTotal === renderedTotal
      && firstVisibleIdentityMatches
      && unresolvedTransientCount === 0
      && ownerlessTransientCount === 0
      && publishedTransientCount === 0;
    const settledCountsAgree = (turnTotal === turnListTotal
      && turnListTotal === renderedTotal)
      || retainedCacheProjection;
    const hydrationOnlyCountDifference = settledCountsAgree
      && firstVisibleIdentityMatches
      && hydratedAnswerTotal > 0
      && hydratedAnswerTotal !== turnListTotal;
    if (!settledCountsAgree || (missing && !hydrationOnlyCountDifference)) {
      const scheduled = scheduleRebuild('core:turn-updated');
      if (scheduled) {
        perfBucket.coreTurnUpdatedRebuildCount = Number(perfBucket.coreTurnUpdatedRebuildCount || 0) + 1;
      }
      return scheduled;
    }
    return false;
  }

  function scheduleMoCooldownTrailingCheck(reason = 'mo:answers') {
    const perfBucket = PERF.automaticRefresh;
    const why = String(reason || 'mo:answers');
    perfBucket.cooldownDeferredCount = Number(perfBucket.cooldownDeferredCount || 0) + 1;
    perfBucket.lastCooldownDeferredReason = why;
    perfBucket.lastCooldownDeferredAt = Date.now();

    const run = () => {
      S.moCooldownDeferredTimer = null;
      if (!S.running) return;
      const remaining = Number(S.moRebuildCooldownUntil || 0) - Date.now();
      if (remaining > 0) {
        arm(remaining + 8);
        return;
      }
      let needsRebuild = false;
      try {
        const counts = readMiniMapStructureCounts();
        const publishedTotal = Number(perfBucket.lastCoreTurnUpdatedTotal || 0);
        const retainedCacheProjection = publishedTotal > 0
          && counts.turnListTotal > publishedTotal
          && counts.turnListTotal === counts.renderedTotal
          && counts.firstVisibleIdentityMatches;
        const publishedCountMismatch = publishedTotal > 0
          && !retainedCacheProjection
          && (publishedTotal !== counts.turnListTotal || publishedTotal !== counts.renderedTotal);
        const hydrationOnlyCountDifference = counts.turnListTotal > 0
          && counts.turnListTotal === counts.renderedTotal
          && (!publishedTotal || publishedTotal === counts.turnListTotal)
          && counts.firstVisibleIdentityMatches
          && counts.hydratedAnswerTotal > 0
          && counts.hydratedAnswerTotal !== counts.turnListTotal;
        needsRebuild = publishedCountMismatch
          || (buildMissing() && !hydrationOnlyCountDifference)
          || paginationCoverageNeedsRebuild(`${why}:cooldown-trailing`);
      } catch {}
      if (!needsRebuild) return;
      S.moRebuildCooldownUntil = Date.now() + MO_REBUILD_COOLDOWN_MS;
      const scheduled = scheduleRebuild(`${why}:cooldown-trailing`);
      if (scheduled) {
        perfBucket.cooldownDeferredRebuildCount = Number(perfBucket.cooldownDeferredRebuildCount || 0) + 1;
      }
    };
    const arm = (delayMs) => {
      const delay = Math.max(0, Number(delayMs || 0) || 0);
      const schedule = MM_schedule();
      if (schedule && typeof schedule.timeoutOnce === 'function') {
        S.moCooldownDeferredTimer = schedule.timeoutOnce('minimap:mo-cooldown-trailing', delay, run);
        return true;
      }
      if (S.moCooldownDeferredTimer) return true;
      S.moCooldownDeferredTimer = setTimeout(run, delay);
      return true;
    };

    return arm(Math.max(0, Number(S.moRebuildCooldownUntil || 0) - Date.now()) + 8);
  }

  function onTurnChange(cb) {
    if (typeof cb !== 'function') return () => {};
    S.turnListeners.add(cb);
    return () => { try { S.turnListeners.delete(cb); } catch {} };
  }

  function clearTimer(name, type = 'timeout') {
    const id = S[name];
    if (!id) return;
    try {
      if (type === 'interval') clearInterval(id);
      else clearTimeout(id);
    } catch {}
    S[name] = null;
  }

  function cancelScheduledTask(key, field, type = 'timeout') {
    const schedule = MM_schedule();
    if (schedule) {
      try { schedule.cancel(key); } catch {}
    }
    const id = S[field];
    if (!id) {
      S[field] = type === 'raf' ? 0 : null;
      return;
    }
    if (type === 'raf') {
      try { cancelAnimationFrame(id); } catch {}
      S[field] = 0;
      return;
    }
    try {
      if (type === 'interval') clearInterval(id);
      else clearTimeout(id);
    } catch {}
    S[field] = null;
  }

  function uiRefsReady(refs = MM_uiRefs()) {
    return !!(
      refs?.root?.isConnected
      && refs?.panel?.isConnected
      && refs?.toggle?.isConnected
    );
  }

  function removedNodeContainsUi(node, refs = MM_uiRefs()) {
    if (!node || node.nodeType !== 1) return false;
    const el = node;
    const targets = [refs?.root, refs?.panel, refs?.toggle].filter(Boolean);
    for (const target of targets) {
      if (!target) continue;
      if (el === target) return true;
      try {
        if (el.contains?.(target)) return true;
      } catch {}
    }
    try {
      if (el.matches?.('[data-cgxui="mnmp-root"], [data-cgxui="mnmp-minimap"], [data-cgxui="mnmp-toggle"], [data-cgxui="mm-panel"], [data-cgxui="mm-toggle"]')) {
        return true;
      }
    } catch {}
    if (Number(el.childElementCount || 0) > 12) return false;
    try {
      return !!el.querySelector?.('[data-cgxui="mnmp-root"], [data-cgxui="mnmp-minimap"], [data-cgxui="mnmp-toggle"], [data-cgxui="mm-panel"], [data-cgxui="mm-toggle"]');
    } catch {
      return false;
    }
  }

  function scheduleStructureRecoveryCheck(reason = 'panel:removed') {
    const perfBucket = PERF.structureRecovery;
    const why0 = String(reason || 'panel:removed');
    perfBucket.callCount = Number(perfBucket.callCount || 0) + 1;
    perfBucket.lastReason = why0;
    perfBucket.lastAt = Date.now();
    S.structureRecoveryReason = why0;
    if (S.structureRecoveryQueued) {
      perfBucket.coalescedCount = Number(perfBucket.coalescedCount || 0) + 1;
      return true;
    }
    S.structureRecoveryQueued = true;
    MM_scheduleRafOnce('minimap:structure-recovery', () => {
      S.structureRecoveryQueued = false;
      perfBucket.executedCheckCount = Number(perfBucket.executedCheckCount || 0) + 1;
      const why = String(S.structureRecoveryReason || reason || 'panel:removed');
      S.structureRecoveryReason = '';
      if (!S.running) return;
      recoverUiStructure(why, { allowWithoutAnswers: why === 'panel:removed' });
    });
    return true;
  }

  function stop(reason = 'engine:stop') {
    completeIndexNavigationCoordinator.cancel(String(reason || 'engine-stop'), 'cancelled');
    completeIndexMountedAnchors.clear();
    cancelScheduledTask('minimap:first-paint', 'firstPaintRaf', 'raf');
    cancelScheduledTask('minimap:first-paint:failsafe', 'failsafeTimer');
    clearTimer('pageJumpTimer');
    cancelScheduledTask('minimap:pagination-check:fast', 'paginationCheckFastTimer');
    cancelScheduledTask('minimap:pagination-check:slow', 'paginationCheckSlowTimer');
    cancelScheduledTask('minimap:mo-cooldown-trailing', 'moCooldownDeferredTimer');
    cancelScheduledTask('minimap:identity-drift-trailing', 'identityDriftTrailingTimer');
    cancelScheduledTask('minimap:sync-active', 'syncRAF', 'raf');
    try { MM_schedule()?.cancel?.('minimap:structure-recovery'); } catch {}
    S.syncQueued = false;
    S.syncReasons.clear();
    S.structureRecoveryQueued = false;
    S.structureRecoveryReason = '';

    try { S.domMO?.disconnect?.(); } catch {}
    try { S.panelMO?.disconnect?.(); } catch {}
    try { S.panelRootMO?.disconnect?.(); } catch {}
    try { S.formRO?.disconnect?.(); } catch {}
    resetVisibleAnswersObserver();
    S.domMO = null;
    S.panelMO = null;
    S.panelRootMO = null;
    S.formRO = null;
    clearMiniMapGuardBindings();

    MINI_clearActiveScrollRoot();
    try { S.offResize?.(); } catch {}
    try { S.offShellReady?.(); } catch {}
    try { S.offBehaviorChanged?.(); } catch {}
    try { S.offRouteChanged?.(); } catch {}
    try { S.offBtnClick?.(); } catch {}
    try { S.offPaginationChanged?.(); } catch {}
    try { S.offPaginationChangedAlias?.(); } catch {}
    try { S.offIndexAppended?.(); } catch {}
    try { S.offIndexHydrated?.(); } catch {}
    try { S.offViewChanged?.(); } catch {}
    try { S.offShellNoButtons?.(); } catch {}
    try { S.offCoreTurnUpdated?.(); } catch {}
    try { S.offCompleteTurnIndexState?.(); } catch {}
    try { S.offMountTransitions?.(); } catch {}
    try { S.offStaleWatchdog?.(); } catch {}
    S.offStaleWatchdog = null;
    S.offScroll = null;
    S.activeScrollRoot = null;
    S.offResize = null;
    S.offShellReady = null;
    S.offBehaviorChanged = null;
    S.offRouteChanged = null;
    S.offBtnClick = null;
    S.offPaginationChanged = null;
    S.offPaginationChangedAlias = null;
    S.offIndexAppended = null;
    S.offIndexHydrated = null;
    S.offViewChanged = null;
    S.offShellNoButtons = null;
    S.offCoreTurnUpdated = null;
    S.offCompleteTurnIndexState = null;
    S.offMountTransitions = null;

    S.running = false;
    S.scrollSyncDisabled = false;
    S.pageJumpToken = 0;
    S.pageJumpUntil = 0;
    S.lastActivePageNum = 0;
    S.lastActiveBtnEl = null;
    S.lastActiveBtnId = '';
    S.moRebuildCooldownUntil = 0;
    S.identityDriftRecoveryVersion = 0;
    S.identityDriftRecoverySignature = '';
    S.identityDriftTrailingRetriedSignature = '';
    S.syntheticCurrentReconcileSignature = '';
    markReady(false);
    dlog('engine:stop', { reason });
    return true;
  }

  function pickAddedAnswerNode(node, answerSel) {
    if (!node || node.nodeType !== 1) return null;
    const el = node;
    if (el.matches?.(answerSel) && isEligibleHostAssistantNode(el)) return el;
    const role = String(el.getAttribute?.('data-message-author-role') || '').toLowerCase();
    if (role === 'assistant' && isEligibleHostAssistantNode(el)) return el;
    const c1 = el.firstElementChild || null;
    if (c1?.matches?.(answerSel) && isEligibleHostAssistantNode(c1)) return c1;
    const c2 = c1?.firstElementChild || null;
    if (c2?.matches?.(answerSel) && isEligibleHostAssistantNode(c2)) return c2;
    const shouldScanDeep = (el.childElementCount || 0) <= 12
      || el.matches?.('[data-testid^="conversation-turn"], [data-testid="conversation-turns"], main');
    if (!shouldScanDeep || !el.querySelector) return null;
    const candidates = Array.from(el.querySelectorAll?.(answerSel) || []);
    return candidates.find((candidate) => isEligibleHostAssistantNode(candidate)) || null;
  }

  function isEligibleHostAssistantNode(node) {
    if (!node || node.nodeType !== 1 || node.isConnected !== true) return false;
    const role = String(node.getAttribute?.('data-message-author-role') || '').toLowerCase();
    if (role !== 'assistant') return false;
    try {
      if (node.closest?.('[data-cgxui-owner], [data-h2o-owner]')) return false;
      if (node.closest?.('[data-cgxui*="divider"], [data-cgxui*="title"], [data-cgxui*="mnmp"]')) return false;
    } catch {}
    const turnHost = node.closest?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]') || null;
    if (!turnHost || turnHost.isConnected !== true) return false;
    try {
      const root = convContainer();
      if (root?.contains && !root.contains(turnHost)) return false;
      if (node.hidden || turnHost.hidden || node.inert || turnHost.inert) return false;
      if (node.closest?.('[hidden], [inert], [aria-hidden="true"], [data-selected="false"], [data-is-current="false"]')) return false;
      const style = window.getComputedStyle?.(turnHost);
      if (style?.display === 'none' || style?.visibility === 'hidden') return false;
    } catch {}
    return true;
  }

  function nodeContainsRealMessageOrTurn(node, answerSel = answersSelector()) {
    if (!node || node.nodeType !== 1) return false;
    const el = node;
    try {
      if (el.matches?.(answerSel)) return true;
    } catch {}
    try {
      const role = String(el.getAttribute?.('data-message-author-role') || '').toLowerCase();
      if (role === 'assistant' || role === 'user') return true;
    } catch {}
    try {
      if (el.matches?.('[data-testid^="conversation-turn"], [data-testid="conversation-turns"]')) return true;
    } catch {}
    try {
      if (el.querySelector?.(`${answerSel}, [data-message-author-role="assistant"], [data-message-author-role="user"], [data-testid^="conversation-turn"], [data-testid="conversation-turns"]`)) return true;
    } catch {}
    return false;
  }

  function isMiniMapOwnedNode(node, answerSel = answersSelector()) {
    if (!node || node.nodeType !== 1) return false;
    const el = node;
    let owned = false;
    try {
      owned = String(el.getAttribute?.('data-cgxui-owner') || '').trim() === 'mnmp';
    } catch {}
    if (!owned) {
      try {
        owned = !!el.closest?.('[data-cgxui-owner="mnmp"]');
      } catch {}
    }
    if (!owned) return false;
    return !nodeContainsRealMessageOrTurn(el, answerSel);
  }

  function collectMutationSignals(muts) {
    const answerSel = answersSelector();
    const added = new Set();
    let rebuildHit = false;
    for (const m of muts || []) {
      if (!m || m.type !== 'childList') continue;
      const hasAdded = !!(m.addedNodes && m.addedNodes.length);
      const hasRemoved = !!(m.removedNodes && m.removedNodes.length);
      if (!hasAdded && !hasRemoved) continue;
      for (const n of Array.from(m?.removedNodes || [])) {
        if (!n || n.nodeType !== 1) continue;
        const el = n;
        if (isMiniMapOwnedNode(el, answerSel)) continue;
        if (el.matches?.(answerSel)) {
          rebuildHit = true;
          break;
        }
        const childCount = Number(el.childElementCount || 0);
        const isTurnLike = !!el.matches?.('[data-testid^="conversation-turn"], [data-testid="conversation-turns"], main');
        if (isTurnLike && childCount <= 12 && el.querySelector?.(answerSel)) {
          rebuildHit = true;
          break;
        }
      }
      for (const n of Array.from(m?.addedNodes || [])) {
        if (isMiniMapOwnedNode(n, answerSel)) continue;
        const answerEl = pickAddedAnswerNode(n, answerSel);
        if (answerEl) added.add(answerEl);
      }
    }
    return { addedAnswers: Array.from(added), rebuildHit };
  }

  function installPanelObservers() {
    try { S.panelMO?.disconnect?.(); } catch {}
    try { S.panelRootMO?.disconnect?.(); } catch {}
    S.panelMO = null;
    S.panelRootMO = null;

    const panelRoot = MM_uiRefs()?.root || null;
    const panelHost = panelRoot?.parentElement || document.body;
    const onPanelMutations = (muts) => {
      if (!S.running) return;
      const refs = MM_uiRefs();
      const hit = muts.some((m) => Array.from(m?.removedNodes || []).some((n) => removedNodeContainsUi(n, refs)));
      if (!hit) return;
      scheduleStructureRecoveryCheck('panel:removed');
    };

    if (panelHost) {
      S.panelMO = new MutationObserver(onPanelMutations);
      S.panelMO.observe(panelHost, { childList: true, subtree: false });
    }
    if (panelRoot) {
      S.panelRootMO = new MutationObserver(onPanelMutations);
      S.panelRootMO.observe(panelRoot, { childList: true, subtree: false });
    }
  }

  function recoverUiStructure(reason = 'panel:removed', opts = {}) {
    if (!S.running) return false;
    const allowWithoutAnswers = !!opts?.allowWithoutAnswers;
    const answersPresent = hasAnswersInDom();
    const refsMissing = !uiRefsReady();
    const missingBuild = buildMissing();

    if (!allowWithoutAnswers && !answersPresent) return false;
    if (!refsMissing && !missingBuild) return false;

    try { MM_ui()?.ensureUI?.(`engine:${reason}`); } catch (e) { derr('recoverUiStructure:ensureUI', e); }
    installPanelObservers();

    if (!uiRefsReady()) {
      PERF.structureRecovery.recoveryTriggeredRebuildCount = Number(PERF.structureRecovery.recoveryTriggeredRebuildCount || 0) + 1;
      scheduleRebuild(reason);
      return true;
    }
    if (!answersPresent && allowWithoutAnswers) return true;
    if (refreshFromIndexedState(reason, { reconcileRows: true })) return true;
    if (!buildMissing()) return true;

    PERF.structureRecovery.recoveryTriggeredRebuildCount = Number(PERF.structureRecovery.recoveryTriggeredRebuildCount || 0) + 1;
    scheduleRebuild(reason);
    return true;
  }

  function startStaleStateWatchdog(tag = 'watchdog') {
    // Retired 300ms interval poller. The MountRegistry's typed transitions
    // (occlusion-proof since the hub's fallback delivery) are the signal
    // that conversation structure changed; three bounded settle checks
    // cover boots where nothing transitions at all. The stale predicate and
    // rebuild action are unchanged.
    try { clearInterval(S.routeRebuildPoller); } catch {}
    S.routeRebuildPoller = null;
    try { S.offStaleWatchdog?.(); } catch {}
    S.offStaleWatchdog = null;
    const startedAt = Date.now();
    const MAX_MS = 30000;
    const stop = () => {
      try { S.offStaleWatchdog?.(); } catch {}
      S.offStaleWatchdog = null;
    };
    const check = (why) => {
      if (!S.running) { stop(); return; }
      if (Date.now() - startedAt > MAX_MS) { stop(); return; }
      let stale = false;
      try {
        stale = buildMissing() || paginationCoverageNeedsRebuild(`${tag}:${why}`);
      } catch {}
      if (!stale) return;
      S.moRebuildCooldownUntil = 0;
      try { rebuildNow(`${tag}:${why}`); } catch { scheduleRebuild(`${tag}:${why}`); }
    };
    const registry = MINI_mountRegistry();
    if (registry && typeof registry.onTransitions === 'function') {
      S.offStaleWatchdog = registry.onTransitions('minimap-stale-watchdog', () => check('transition'));
    }
    for (const delay of [500, 2000, 8000]) {
      setTimeout(() => check(`settle-${delay}`), delay);
    }
    check('immediate');
  }

  function bindObservers() {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    const on = SH?.util?.on || ((t, ev, fn, opts) => {
      t?.addEventListener?.(ev, fn, opts);
      return () => { try { t?.removeEventListener?.(ev, fn, opts); } catch {} };
    });

    const root = convContainer();
    if (root) {
      S.domMO = new MutationObserver((muts) => {
        if (!S.running) return;
        const sig = collectMutationSignals(muts);
        if (sig.addedAnswers.length) MINI_bindActiveScrollRoot('mo:answers:scroll-root-bind');
        const core = MM_core();
        const chatId = resolveChatId();
        let didDeltaAppend = false;
        let appendStructuralFailure = false;
        const observedNewAnswers = [];
        if (sig.addedAnswers.length) {
          const appendFn = core?.appendTurnFromAnswerEl;
          if (typeof appendFn === 'function' && chatId) {
            for (const answerEl of sig.addedAnswers) {
              let out = null;
              try { out = appendFn(chatId, answerEl, { source: 'engine:mo' }); } catch {}
              const status = String(out?.status || '').trim();
              if (out?.ok || status === 'appended' || status === 'exists') {
                didDeltaAppend = true;
                observedNewAnswers.push(answerEl);
              }
              if (status === 'error' || status === 'non-monotonic' || status === 'ui-missing') {
                appendStructuralFailure = true;
              }
            }
          }
        }
        if (didDeltaAppend) {
          try { observeVisibleAnswers(observedNewAnswers.length ? observedNewAnswers : sig.addedAnswers, { incremental: true, prune: true }); } catch {}
          scheduleSyncActive('mo:append');
        }
        const shouldCheckRecovery = !!sig.rebuildHit || appendStructuralFailure || (!!sig.addedAnswers.length && !didDeltaAppend);
        if (shouldCheckRecovery) {
          const needsRebuild = appendStructuralFailure
            || sig.rebuildHit
            || buildMissing()
            || paginationCoverageNeedsRebuild('mo:answers');
          if (!needsRebuild) return;
          const now = Date.now();
          if (now >= Number(S.moRebuildCooldownUntil || 0)) {
            S.moRebuildCooldownUntil = now + MO_REBUILD_COOLDOWN_MS;
            scheduleRebuild('mo:answers');
          } else {
            scheduleMoCooldownTrailingCheck('mo:answers');
          }
        }
      });
      S.domMO.observe(root, { childList: true, subtree: true });
    }

    MINI_bindActiveScrollRoot('observer-bind:scroll-root-bind');
    S.offResize = on(window, 'resize', () => {
      try { W.positionCounterBox?.(); } catch {}
      scheduleSyncActive('resize');
    }, { passive: true });

    const form = formEl();
    if (form && typeof ResizeObserver === 'function') {
      S.formRO = new ResizeObserver(() => {
        try { W.positionCounterBox?.(); } catch {}
      });
      S.formRO.observe(form);
    }

    installPanelObservers();
    if (!S.offShellNoButtons) {
      S.offShellNoButtons = on(window, EVT_SHELL_NO_BUTTONS, (e) => {
        PERF.structureRecovery.shellNoButtonsEvents = Number(PERF.structureRecovery.shellNoButtonsEvents || 0) + 1;
        if (!S.running) return;
        if (!hasAnswersInDom()) return;
        if (!buildMissing()) return;
        const why = String(e?.detail?.reason || 'shell:no-buttons').trim() || 'shell:no-buttons';
        scheduleStructureRecoveryCheck(`shell:no-buttons:${why}`);
      }, { passive: true });
    }
    if (!S.offCoreTurnUpdated) {
      S.offCoreTurnUpdated = on(window, EVT_CORE_TURN_UPDATED, (event) => {
        onCoreTurnUpdated(event?.detail || {});
      }, { passive: true });
    }
    if (!S.offCompleteTurnIndexState) {
      S.offCompleteTurnIndexState = on(window, EVT_COMPLETE_TURN_INDEX_STATE, (event) => {
        if (event?.detail?.enabled !== true) {
          completeIndexNavigationCoordinator.cancel('gate-disabled', 'cancelled');
          completeIndexMountedAnchors.clear();
          S.completeIndexAnchorsBootstrapped = false;
          return;
        }
        MINI_bindActiveScrollRoot('complete-index-state:scroll-root-bind');
        S.completeIndexAnchorsBootstrapped = false;
        try {
          MINI_bindCompleteIndexMountedAnchors();
          S.completeIndexAnchorsBootstrapped = true;
        } catch {}
        scheduleSyncActive('complete-index-state');
      }, { passive: true });
    }
    if (!S.offMountTransitions) {
      /* Registry transitions replace rescanning: when the host mounts,
         replaces, or unmounts turn elements, the hub tells us — anchor
         rebinding and active-row sync become event-driven instead of a
         per-frame document sweep. The scheduleSyncActive path keeps the
         mmProgram/mmUser guards, so programmatic navigation stays exempt. */
      const mounts = MINI_mountRegistry();
      if (mounts && typeof mounts.onTransitions === 'function') {
        S.offMountTransitions = mounts.onTransitions('minimap-engine', (payload) => {
          if (!S.running) return;
          try { MINI_applyMountTransitions(payload); } catch {}
          scheduleSyncActive('mount-transition');
        });
      }
    }
    bindMiniMapScrollGuards();

    const onRouteChanged = (tag = 'route') => {
      if (!S.running) return;
      completeIndexNavigationCoordinator.cancel('route-changed', 'stale-route-discarded');
      completeIndexMountedAnchors.clear();
      // A new route needs its own bounded bootstrap before deltas maintain it.
      S.completeIndexAnchorsBootstrapped = false;
      MINI_clearActiveScrollRoot();
      resetVisibleAnswersObserver();
      MINI_bindActiveScrollRoot(`${tag}:scroll-root-bind`);
      S.moRebuildCooldownUntil = 0;
      startStaleStateWatchdog(tag);
    };
    try {
      window.addEventListener(EVT_ROUTE_CHANGED, onRouteChanged, true);
      window.addEventListener(EVT_ROUTE_CHANGED.replace(/^evt:/, ''), onRouteChanged, true);
      S.offRouteChanged = () => {
        try { window.removeEventListener(EVT_ROUTE_CHANGED, onRouteChanged, true); } catch {}
        try { window.removeEventListener(EVT_ROUTE_CHANGED.replace(/^evt:/, ''), onRouteChanged, true); } catch {}
      };
    } catch {}

    try {
      window.addEventListener('popstate', onRouteChanged, true);
      const _offPopState = S.offRouteChanged;
      S.offRouteChanged = () => {
        try { _offPopState?.(); } catch {}
        try { window.removeEventListener('popstate', onRouteChanged, true); } catch {}
      };
    } catch {}

    try {
      if (!W.__H2O_MM_HISTORY_PATCHED__) {
        W.__H2O_MM_HISTORY_PATCHED__ = true;
        let lastPath = String(location.pathname || '');
        const dispatchRouteChange = () => {
          const newPath = String(location.pathname || '');
          if (newPath === lastPath) return;
          lastPath = newPath;
          try { window.dispatchEvent(new CustomEvent(EVT_ROUTE_CHANGED, { detail: { url: newPath } })); } catch {}
          try { window.dispatchEvent(new CustomEvent(EVT_ROUTE_CHANGED.replace(/^evt:/, ''), { detail: { url: newPath } })); } catch {}
        };
        const origPushState = history.pushState;
        const origReplaceState = history.replaceState;
        history.pushState = function (...args) {
          const r = origPushState.apply(this, args);
          try { dispatchRouteChange(); } catch {}
          return r;
        };
        history.replaceState = function (...args) {
          const r = origReplaceState.apply(this, args);
          try { dispatchRouteChange(); } catch {}
          return r;
        };
      }
    } catch {}

    const onPaginationChanged = () => {
      if (!S.running) return;
      ensureChatPageDividerBridgeFromRuntime();
      const chatId = resolveChatId();
      try { MM_core()?.attachVisibleAnswers?.(chatId); } catch {}
      try { observeVisibleAnswers(currentAnswerEls()); } catch {}
      MINI_bindActiveScrollRoot('pagination:pagechanged:scroll-root-bind');
      if (hasPendingPageJump()) return;
      if (paginationCoverageNeedsRebuild('pagination:pagechanged')) {
        scheduleRebuild('pagination:canonical-mismatch:pagechanged');
        return;
      }
      scheduleSyncActive('pagination:pagechanged');
    };
    S.offPaginationChanged = on(window, EVT_PAGE_CHANGED, onPaginationChanged, { passive: true });
    S.offPaginationChangedAlias = on(window, EVT_PAGE_CHANGED_ALIAS, onPaginationChanged, { passive: true });

    const onIndexHydrated = () => {
      if (!S.running) return;
      ensureChatPageDividerBridgeFromRuntime();
      const chatId = resolveChatId();
      try { MM_core()?.attachVisibleAnswers?.(chatId); } catch {}
      try { observeVisibleAnswers(currentAnswerEls()); } catch {}
      MINI_bindActiveScrollRoot('index:hydrated:scroll-root-bind');
      schedulePaginationCoverageCheck('index:hydrated');
      scheduleSyncActive('index:hydrated');
    };
    S.offIndexHydrated = on(window, EVT_MM_INDEX_HYDRATED, onIndexHydrated, { passive: true });

    const onIndexAppended = (e) => {
      if (!S.running) return;
      const detail = e?.detail || {};
      const msgId = String(detail?.msgId || detail?.answerId || '').trim();
      if (msgId) {
        const answerEl = findAnswerById(msgId);
        if (answerEl) {
          try { observeVisibleAnswers([answerEl], { incremental: true, prune: true }); } catch {}
        }
      }
      scheduleSyncActive('index:appended');
    };
    S.offIndexAppended = on(window, EVT_MM_INDEX_APPENDED, onIndexAppended, { passive: true });

    const onViewChanged = (e) => {
      if (!S.running) return;
      const detail = e?.detail || {};
      const modeFromEvent = String(detail?.mode || detail?.nextMode || '').trim();
      if (modeFromEvent) {
        if (modeFromEvent === String(S.lastViewMode || '').trim()) return;
        S.lastViewMode = modeFromEvent;
      } else {
        const modeNow = currentViewMode();
        if (modeNow && modeNow === String(S.lastViewMode || '').trim()) return;
        if (modeNow) S.lastViewMode = modeNow;
      }
      MM_scheduleRafOnce('minimap:view-refresh', () => {
        if (!S.running) return;
        if (refreshFromIndexedState('view:changed', { reconcileRows: true })) return;
        scheduleRebuild('view:changed');
      });
    };
    S.offViewChanged = on(window, EVT_MM_VIEW_CHANGED, onViewChanged, { passive: true });
  }

  function hasAnswersInDom() {
    try {
      if (hasAnswersInDomCheap()) return true;
      const list = MM_core()?.getAnswerList?.();
      if (Array.isArray(list)) return list.some((el) => !!el && el.isConnected);
      return false;
    } catch {
      return false;
    }
  }

  function hasAnswersInDomCheap() {
    try { return !!q(answersSelector()); } catch { return false; }
  }

  function getPaginationCoverageDetail() {
    try {
      return MM_core()?.validateTurnsAgainstPagination?.() || null;
    } catch {
      return null;
    }
  }

  function paginationCoverageNeedsRebuild(reason = 'pagination') {
    const detail = getPaginationCoverageDetail();
    if (!detail || !detail.applicable || detail.ok) return false;
    if (PERF_ASSERT_ON) {
      try { console.warn('[MiniMap] pagination canonical mismatch → rebuild', { reason, detail }); } catch {}
    }
    return true;
  }

  function schedulePaginationCoverageCheck(reason = 'pagination') {
    const why = String(reason || 'pagination');
    const run = (tag) => {
      if (!S.running) return;
      if (!paginationCoverageNeedsRebuild(`${why}:${tag}`)) return;
      scheduleRebuild(`pagination:canonical-mismatch:${why}:${tag}`);
    };

    const schedule = MM_schedule();
    cancelScheduledTask('minimap:pagination-check:fast', 'paginationCheckFastTimer');
    cancelScheduledTask('minimap:pagination-check:slow', 'paginationCheckSlowTimer');
    if (schedule) {
      S.paginationCheckFastTimer = schedule.timeoutOnce('minimap:pagination-check:fast', 120, () => {
        S.paginationCheckFastTimer = null;
        run('fast');
      });
      S.paginationCheckSlowTimer = schedule.timeoutOnce('minimap:pagination-check:slow', 700, () => {
        S.paginationCheckSlowTimer = null;
        run('slow');
      });
      return;
    }
    S.paginationCheckFastTimer = setTimeout(() => {
      S.paginationCheckFastTimer = null;
      run('fast');
    }, 120);
    S.paginationCheckSlowTimer = setTimeout(() => {
      S.paginationCheckSlowTimer = null;
      run('slow');
    }, 700);
  }

  function cacheBootNeedsRebuild(cacheResult) {
    const renderedCount = Number(cacheResult?.renderedCount || 0);
    const answersExist = hasAnswersInDomCheap();
    if (renderedCount === 0 && answersExist) return true;
    const paginationCoverage = cacheResult?.paginationCoverage || getPaginationCoverageDetail();
    if (paginationCoverage?.applicable && !paginationCoverage?.ok) return true;
    const identityAlignment = readMiniMapIdentityAlignment({ allowRetainedProjection: true });
    if (identityAlignment?.available && identityAlignment?.missing) return true;
    return false;
  }

  function buildMissing() {
    const core = MM_core();
    const turnList = core?.getTurnList?.() || [];
    const turns = Number(turnList.length || 0);
    const domEls = (() => { try { return Array.from(document.querySelectorAll(answersSelector())); } catch { return []; } })();
    const domAnswers = domEls.length;
    if (domAnswers > turns) return true;
    if (domAnswers > 0 && turns > 0) {
      try {
        const firstId = String(domEls[0]?.getAttribute?.('data-message-id') || domEls[0]?.dataset?.messageId || '').trim();
        if (firstId) {
          const found = !!core?.getTurnById?.(firstId) || turnList.some((t) => {
            const ids = [
              ...(Array.isArray(t?.answerIds) ? t.answerIds : []),
              t?.answerId,
              t?.primaryAId,
              t?.aId,
              t?.id,
            ].map((value) => String(value || '').replace(/^turn:/, ''));
            return ids.includes(firstId);
          });
          if (!found) return true;
        }
      } catch {}
    }
    let btns = 0;
    const scope = minimapCol() || minimapPanel() || null;
    if (scope) {
      markPerfFullScan();
      try { btns = Number(scope.querySelectorAll(mmBtnSelector()).length || 0); } catch {}
    } else {
      markPerfFullScan();
      btns = Number(qq(mmBtnSelector()).length || 0);
    }
    return turns <= 0 || btns < turns;
  }

  function scheduleFirstPaintRebuild(reason = 'boot') {
    const why = String(reason || 'boot');
    const schedule = MM_schedule();
    cancelScheduledTask('minimap:first-paint', 'firstPaintRaf', 'raf');
    cancelScheduledTask('minimap:first-paint:failsafe', 'failsafeTimer');

    const stage = (tag) => {
      if (!S.running || !hasAnswersInDom()) return false;
      const probeReason = `boot:first-paint:${why}:${tag}`;
      if (buildMissing()) return scheduleRebuild(probeReason);
      if (paginationCoverageNeedsRebuild(probeReason)) {
        return scheduleRebuild(`pagination:canonical-mismatch:${probeReason}`);
      }
      return scheduleSyncActive(probeReason);
    };

    if (schedule) {
      S.firstPaintRaf = schedule.rafOnce('minimap:first-paint', () => {
        S.firstPaintRaf = 0;
        stage('raf');
      });
      S.failsafeTimer = schedule.timeoutOnce('minimap:first-paint:failsafe', 1000, () => {
        S.failsafeTimer = null;
        stage('1000ms');
      });
      return;
    }
    S.firstPaintRaf = requestAnimationFrame(() => {
      S.firstPaintRaf = 0;
      stage('raf');
    });
    S.failsafeTimer = setTimeout(() => {
      S.failsafeTimer = null;
      stage('1000ms');
    }, 1000);
  }

  function start(reason = 'engine:start') {
    if (S.running) return true;
    const core = MM_core();
    if (!core || TOPW.H2O_MM_CORE_READY !== true) {
      warn('Core not ready; runtime idle.', { reason });
      return false;
    }
    if (!shellReady()) {
      warn('Shell not ready; runtime idle.', { reason });
      return false;
    }

    S.running = true;

    // Shell owns first UI mount; engine only verifies refs once shell is ready.
    try { MM_ui()?.ensureUI?.(`engine:${reason}`); } catch (e) { derr('start:ensureUI', e); }
    try { core.initCore?.(); } catch (e) { derr('start:initCore', e); }
    try { ensureChatPageDividerBridgeFromRuntime(true); } catch (e) { derr('start:ensureChatPageDividerBridge', e); }
    try { ensureDelegatedHandlers(); } catch (e) { derr('start:bindDelegatedHandlers', e); }
    try { W.H2O?.MM?.dots?.attachInlineMutationObserver?.(); } catch (e) { derr('start:attachInlineMutationObserver', e); }

    const bootMode = getBootMode();
    const chatId = resolveChatId();
    S.lastViewMode = currentViewMode() || String(S.lastViewMode || '');
    let cacheResult = null;
    let cacheBootRendered = false;
    if (bootMode === BOOT_MODE_CACHE_FIRST && typeof core.renderFromCache === 'function') {
      try {
        cacheResult = core.renderFromCache(chatId);
        cacheBootRendered = !!cacheResult?.ok;
      } catch (e) {
        derr('start:renderFromCache', e);
        cacheBootRendered = false;
      }
      const mismatch = (!cacheResult || !cacheResult.ok) || cacheBootNeedsRebuild(cacheResult);
      if (mismatch) {
        if (PERF_ASSERT_ON) {
          try { console.warn('[MiniMap] cache mismatch → rebuild fallback'); } catch {}
        }
        scheduleRebuild('cache:mismatch');
      }
    }

    bindObservers();
    if (cacheBootRendered) {
      try { core.attachVisibleAnswers?.(chatId); } catch (e) { derr('start:attachVisibleAnswers:cache', e); }
      try { observeVisibleAnswers(currentAnswerEls()); } catch (e) { derr('start:observeVisibleAnswers:cache', e); }
      try { bindMiniMapScrollGuards(); } catch (e) { derr('start:bindMiniMapScrollGuards:cache', e); }
      scheduleSyncActive('boot:cache');
    } else if (hasAnswersInDom()) rebuildNow(`boot:answers-present:${reason}`);
    else scheduleRebuild(`boot:${reason}`);
    scheduleFirstPaintRebuild(reason);
    try { startStaleStateWatchdog('boot'); } catch (e) { derr('start:startStaleStateWatchdog', e); }

    dlog('engine:start', {
      reason,
      bootMode,
      cacheBootRendered,
      cacheStatus: String(cacheResult?.status || ''),
    });
    return true;
  }

  const RUNTIME_API = {
    ver: ENGINE_VER,
    owner: 'engine',
    start,
    stop,
    scheduleRebuild,
    rebuildNow,
    getActiveTurnId,
    getActiveId: getActiveTurnId,
    setActiveTurnId,
    getTurnIndex,
    onTurnChange,
    getCompleteIndexNavigationStatus,
    getHistoryWideningStatus,
  };

  function installRuntimeApi() {
    try {
      const SH = TOPW.H2O_MM_SHARED?.get?.();
      if (SH?.api) SH.api.rt = Object.assign({}, SH.api.rt || {}, RUNTIME_API);
      return true;
    } catch {
      return false;
    }
  }

  function shellReady() {
    try { return TOPW.H2O_MM_SHELL_READY === true; } catch { return false; }
  }

  function depsReady() {
    const core = MM_core();
    const refs = MM_uiRefs();
    const hasUiRefs = !!(refs?.root && refs?.panel && refs?.toggle);
    return !!core
      && TOPW.H2O_MM_CORE_READY === true
      && shellReady()
      && hasUiRefs;
  }

  function clearBootTimer() {
    try { if (S.bootTimer) clearTimeout(S.bootTimer); } catch {}
    S.bootTimer = null;
  }

  function emitEngineReady() {
    // P3b (Loader V3 readiness migration): write to bounded readyCache so
    // late subscribers attached AFTER this emission still receive the
    // detail via H2O.events.onReady(...). emitReady() also fans out via
    // H2O.events.emit() so bus subscribers are notified. The raw window
    // dispatchEvent(...) below is RETAINED unchanged as backup for
    // window-listener consumers (MM plugins, 0E1a Export Chat, 2A1a
    // Question Wrapper, etc.).
    try { window.H2O?.events?.emitReady?.(EVT_ENGINE_READY, { ver: ENGINE_VER }); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent(EVT_ENGINE_READY, { detail: { ver: ENGINE_VER } })); } catch {}
  }

  function installDelegatedHandlersBridge() {
    try {
      if (typeof W.H2O_MM_bindDelegatedHandlersOnce !== 'function') {
        W.H2O_MM_bindDelegatedHandlersOnce = function H2O_MM_bindDelegatedHandlersOnce() {
          try { ensureDelegatedHandlers(); } catch {}
          return true;
        };
      }
    } catch {}
  }

  function bootAttempt(source = 'timer') {
    if (S.bootDone) return;
    diagAssertNoMainHelpers();

    S.bootTries++;
    if (!depsReady()) {
      if (S.bootTries >= BOOT_MAX_TRIES) {
        warn('Dependencies missing for runtime cutover; engine idle.', { source, tries: S.bootTries, coreReady: TOPW.H2O_MM_CORE_READY === true, shellReady: shellReady(), uiRefs: !!(MM_uiRefs()?.root && MM_uiRefs()?.panel && MM_uiRefs()?.toggle) });
        clearBootTimer();
      }
      return;
    }

    if (!installRuntimeApi()) return;
    if (!start(`boot:${source}`)) return;

    S.bootDone = true;
    if (!PERF.bootCompletedAt) PERF.bootCompletedAt = Date.now();
    markReady(true);
    emitEngineReady();
    clearBootTimer();
  }

  function scheduleBootTick() {
    clearBootTimer();
    S.bootTimer = setTimeout(() => {
      bootAttempt('retry');
      if (!S.bootDone && S.bootTries < BOOT_MAX_TRIES) scheduleBootTick();
    }, BOOT_GAP_MS);
  }

  function bindRetryHooks() {
    const retry = () => {
      if (S.bootDone) return;
      bootAttempt('event');
      if (!S.bootDone && S.bootTries < BOOT_MAX_TRIES) scheduleBootTick();
    };

    try {
      window.addEventListener(EVT_SHELL_READY, retry);
      S.offShellReady = () => { try { window.removeEventListener(EVT_SHELL_READY, retry); } catch {} };
    } catch {}

    try {
      const onBehaviorChanged = () => {
        try { behaviorApi()?.get?.(true); } catch {}
      };
      window.addEventListener(EVT_BEHAVIOR_CHANGED, onBehaviorChanged, true);
      S.offBehaviorChanged = () => { try { window.removeEventListener(EVT_BEHAVIOR_CHANGED, onBehaviorChanged, true); } catch {} };
    } catch {}
  }

  markPlugin();
  markReady(false);
  installDelegatedHandlersBridge();
  installRuntimeApi();
  bindRetryHooks();
  bootAttempt('init');
  if (!S.bootDone) scheduleBootTick();

  /* ─────────────── Phase 4 Step 1: chatRoot fast-path ───────────────
   * Additive peer to the legacy scheduleBootTick polling and the
   * EVT_SHELL_READY hook in bindRetryHooks(). When the conversation
   * root appears (signalled by H2O.obs.chatRootObserved — a Phase 3
   * API thinly wrapping the Observer Hub's existing onReady contract),
   * we fire one immediate bootAttempt('chatRoot'). In the happy path
   * this lets the engine boot ~50-200 ms earlier than the next 120 ms
   * poll tick would have caught it.
   *
   * Fallback semantics are preserved exactly:
   *   • scheduleBootTick (above) still runs on its own — full
   *     BOOT_MAX_TRIES × BOOT_GAP_MS = 9600 ms budget.
   *   • If the Hub API is unavailable, this block is skipped.
   *   • If the Promise rejects or chatRootObserved() returns null
   *     (e.g. timeoutMs expired on /settings or empty surface),
   *     we still try one defensive bootAttempt and let the legacy
   *     polling continue.
   *   • routeRebuildPoller (line 3034) is untouched.
   *   • No MutationObservers are migrated in this step.
   *
   * Reversible: deleting this block restores the prior boot behavior
   * exactly. ──────────────────────────────────────────────────────── */
  if (!S.bootDone) {
    try {
      const obsApi = (TOPW && TOPW.H2O && TOPW.H2O.obs) || (W && W.H2O && W.H2O.obs) || null;
      if (obsApi && typeof obsApi.chatRootObserved === 'function') {
        Promise.resolve(obsApi.chatRootObserved({ timeoutMs: BOOT_MAX_TRIES * BOOT_GAP_MS }))
          .then((root) => {
            if (S.bootDone) return;
            try { bootAttempt(root ? 'chatRoot' : 'chatRoot:timeout'); } catch (_) {}
          })
          .catch(() => { /* legacy polling already covers this */ });
      }
    } catch (_) { /* swallow; legacy polling already covers this */ }
  }
})();
