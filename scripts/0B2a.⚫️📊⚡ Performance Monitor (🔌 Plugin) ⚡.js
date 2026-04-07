// ==UserScript==
// @h2o-id             0b2a.perf.monitor
// @name               0B2a.⚫️📊⚡ Performance Monitor (🔌 Plugin) ⚡
// @namespace          H2O.Premium.CGX.perf.monitor
// @author             HumamDev
// @version            2.0.0
// @revision           001
// @build              260331-173500
// @description        Shared performance snapshot API for H2O: heap, DOM, Pagination, MiniMap, Unmount, Observer Hub, Governor, and lightweight cost attribution. Instruments MiniMap Core and Engine rebuild paths non-destructively.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W    = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const TOPW = W.top || W;
  const D    = document;

  /* ─── Identity ───────────────────────────────────────────────────────────── */
  const TOK    = 'PF';
  const PID    = 'prfsnp';
  const CID    = 'perfsnapshot';
  const SkID   = 'prfs';
  const MODTAG = 'PerfSnapshot';
  const SUITE  = 'prm';
  const HOST   = 'cgx';
  const BrID   = PID;

  const BOOT_KEY = `${TOK}:${PID}:booted`;
  if (TOPW[BOOT_KEY]) return;
  TOPW[BOOT_KEY] = true;

  const H2O   = (TOPW.H2O = TOPW.H2O || {});
  H2O[TOK]    = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta  = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };
  VAULT.state = VAULT.state || {};

  const S = VAULT.state;

  const BODY_DOM_REFRESH_MS = 10000;
  const BODY_DOM_REFRESH_EVERY_SNAPSHOTS = 5;
  const CMD_GEOM_REFRESH_MS = 2000;
  const CMD_GEOM_REFRESH_EVERY_SNAPSHOTS = 3;
  const LONG_TASK_WINDOW_MS = 30000;
  const EVENT_LOOP_INTERVAL_MS = 1000;
  const EVENT_LOOP_WINDOW_SAMPLES = 30;
  const OBS_VOLUME_WINDOW_MS = 30000;
  const REBUILD_AVG_WINDOW = 60;
  const PERF_TIME = () => {
    try { return Number(W.performance?.now?.() || 0); } catch { return 0; }
  };

  /* ─── Persistent state ───────────────────────────────────────────────────── */
  S.booted       = !!S.booted;
  S.installTries = Number(S.installTries || 0);
  S.installTimer = Number(S.installTimer || 0);
  S.coreWrapped  = !!S.coreWrapped;
  S.rtWrapped    = !!S.rtWrapped;
  S.pgWrapped    = !!S.pgWrapped;
  S.umWrapped    = !!S.umWrapped;
  S.listenersInstalled = !!S.listenersInstalled;
  S.startedAt    = Number(S.startedAt || Date.now());
  S.seq          = Number(S.seq || 0);
  S.bodyDomNodes = Number.isFinite(Number(S.bodyDomNodes)) ? Number(S.bodyDomNodes) : null;
  S.bodyDomCountAt = Number(S.bodyDomCountAt || 0);
  S.bodyDomCountSeq = Number(S.bodyDomCountSeq || 0);
  S.firstSnapshotAt = Number(S.firstSnapshotAt || 0);
  S.lastSeen = S.lastSeen || {};
  S.lastSeen.minimapReadyAt = Number(S.lastSeen.minimapReadyAt || 0);
  S.lastSeen.paginationReadyAt = Number(S.lastSeen.paginationReadyAt || 0);
  S.lastSeen.unmountReadyAt = Number(S.lastSeen.unmountReadyAt || 0);
  S.lastSeen.observerHubReadyAt = Number(S.lastSeen.observerHubReadyAt || 0);
  S.lastSeen.commandBarReadyAt = Number(S.lastSeen.commandBarReadyAt || 0);

  S.snapshotStats = S.snapshotStats || {
    lastMs: null,
    avgMs: null,
    peakMs: null,
    samples: 0,
  };

  S.peaks = S.peaks || {
    heapUsedMB: null,
    conversationDomNodes: null,
    domNodes: null,
  };

  S.commandBarGeom = S.commandBarGeom || {
    lastMs: null,
    lastAt: 0,
    lastSeq: 0,
    width: null,
    height: null,
    collapsed: null,
    present: false,
  };

  S.longTask = S.longTask || {
    supported: false,
    observer: null,
    entries: [],
    totalCount: 0,
    lastMs: null,
    peakMs: null,
  };

  S.eventLoop = S.eventLoop || {
    intervalId: 0,
    expectedAt: 0,
    lastLagMs: null,
    avgLagMs: null,
    peakLagMs: null,
    samples: 0,
    sampleWindow: [],
  };

  S.obsVolume = S.obsVolume || {
    entries: [],
    totalFlushes: 0,
    totalRawBatches: 0,
    totalAdded: 0,
    totalRemoved: 0,
    totalConversationRelevant: 0,
  };

  S.pagination = S.pagination || {
    lastRenderMs: null,
    avgRenderMs: null,
    samples: 0,
    lastOp: '',
    lastAt: 0,
  };

  S.unmountPerf = S.unmountPerf || {
    lastPassMs: null,
    avgPassMs: null,
    passSamples: 0,
    lastPassReason: '',
    lastPassAt: 0,
    lastHiddenBefore: null,
    lastHiddenAfter: null,
    lastHiddenDelta: null,
    lastRestoreMs: null,
    avgRestoreMs: null,
    restoreSamples: 0,
    lastRestoreAt: 0,
    lastRestoreCount: null,
  };

  S.mm = S.mm || {
    coreScheduleRequests:   0,
    coreRebuildNowCalls:    0,
    engineScheduleRequests: 0,
    engineRebuildNowCalls:  0,
    lastCoreReason:         '',
    lastEngineReason:       '',
    lastCoreRebuildAt:      0,
    lastEngineRebuildAt:    0,
    lastCoreRebuildStatus:  '',
    lastEngineRebuildStatus:'',
    coreRebuildLastMs:      null,
    coreRebuildAvgMs:       null,
    coreRebuildSamples:     0,
    engineRebuildLastMs:    null,
    engineRebuildAvgMs:     null,
    engineRebuildSamples:   0,
  };

  /* ─── Tiny helpers ───────────────────────────────────────────────────────── */
  function safeNow() {
    const n = Date.now();
    return Number.isFinite(n) ? n : 0;
  }

  function roundMs(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }

  function toMB(v) {
    const n = Number(v || 0);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round((n / 1048576) * 10) / 10;
  }

  function avgPush(avg, count, next, windowCap = REBUILD_AVG_WINDOW) {
    const n = Number(next);
    if (!Number.isFinite(n) || n < 0) return { avg, count };
    const prevAvg = Number(avg);
    const prevCount = Number(count || 0);
    if (!Number.isFinite(prevAvg) || prevCount <= 0) {
      return { avg: n, count: 1 };
    }
    const capped = Math.min(Math.max(1, prevCount), Math.max(1, Number(windowCap || REBUILD_AVG_WINDOW)));
    const nextCount = Math.min(capped + 1, Math.max(1, Number(windowCap || REBUILD_AVG_WINDOW)));
    const nextAvg = ((prevAvg * capped) + n) / nextCount;
    return { avg: roundMs(nextAvg), count: nextCount };
  }

  function updatePeak(key, value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    const prev = Number(S.peaks[key]);
    if (!Number.isFinite(prev) || n > prev) S.peaks[key] = n;
  }

  function trimWindow(arr, windowMs, now = safeNow(), key = 'ts') {
    if (!Array.isArray(arr) || !arr.length) return arr || [];
    const minTs = Number(now || 0) - Number(windowMs || 0);
    while (arr.length && Number(arr[0]?.[key] || 0) < minTs) arr.shift();
    return arr;
  }

  /* ─── DOM node count helpers ─────────────────────────────────────────────── */
  function countNodes(root) {
    if (!root || !root.isConnected) return null;
    try { return 1 + root.querySelectorAll('*').length; } catch { return null; }
  }

  function getCachedBodyNodeCount(root) {
    if (!root || !root.isConnected) return null;
    const now = safeNow();
    const seq = Number(S.seq || 0);
    const staleByTime = (now - Number(S.bodyDomCountAt || 0)) >= BODY_DOM_REFRESH_MS;
    const staleBySeq = (seq - Number(S.bodyDomCountSeq || 0)) >= BODY_DOM_REFRESH_EVERY_SNAPSHOTS;
    if (S.bodyDomNodes == null || staleByTime || staleBySeq) {
      S.bodyDomNodes = countNodes(root);
      S.bodyDomCountAt = now;
      S.bodyDomCountSeq = seq;
    }
    return S.bodyDomNodes;
  }

  function getConversationRoot() {
    try {
      const root = TOPW.H2O?.obs?.getRoot?.();
      if (root?.isConnected) return root;
    } catch {}
    try {
      const turn = D.querySelector('[data-testid="conversation-turn"],[data-testid^="conversation-turn-"]');
      if (turn?.parentElement) return turn.parentElement;
    } catch {}
    return D.querySelector('main') || D.body || D.documentElement || null;
  }

  /* ─── Subsystem locators ─────────────────────────────────────────────────── */
  function mmCoreApi() {
    try {
      return TOPW.H2O_MM_SHARED?.get?.()?.api?.core
          || TOPW.H2O_MM_CORE_API
          || null;
    } catch {
      return TOPW.H2O_MM_CORE_API || null;
    }
  }

  function mmRtApi() {
    try {
      return TOPW.H2O_MM_SHARED?.get?.()?.api?.rt
          || TOPW.H2O_MM_SHARED_RT
          || null;
    } catch {
      return TOPW.H2O_MM_SHARED_RT || null;
    }
  }

  function paginationApi() {
    const api = TOPW.H2O_Pagination;
    return (api && typeof api === 'object') ? api : null;
  }

  function unmountApi() {
    return TOPW?.H2O?.UM?.nmntmssgs?.api || null;
  }

  function unmountVaultState() {
    return TOPW?.H2O?.UM?.nmntmssgs?.state || null;
  }

  function observerHubApi() {
    const api = TOPW.H2O?.obs;
    return (api && typeof api === 'object') ? api : null;
  }

  function governorApi() {
    return TOPW?.H2O?.GV?.prfgvn?.api || null;
  }

  function commandBarRoot() {
    return D.querySelector('.h2o-archive-dock') || null;
  }

  /* ─── Readiness markers ──────────────────────────────────────────────────── */
  function markReady(name, ready) {
    if (!ready) return;
    if (!S.lastSeen[name]) S.lastSeen[name] = safeNow();
  }

  function markKnownSubsystems() {
    markReady('minimapReadyAt', !!mmCoreApi() || !!mmRtApi() || !!TOPW.H2O_MM_SHELL_READY);
    markReady('paginationReadyAt', !!paginationApi());
    markReady('unmountReadyAt', !!unmountApi());
    markReady('observerHubReadyAt', !!observerHubApi());
    markReady('commandBarReadyAt', !!commandBarRoot());
  }

  function relativeMs(absTs) {
    const ts = Number(absTs || 0);
    if (!ts) return null;
    return Math.max(0, ts - Number(S.startedAt || ts));
  }

  /* ─── MiniMap version resolution ────────────────────────────────────────── */
  function getMiniMapVersions() {
    const core = mmCoreApi();
    const rt   = mmRtApi();
    return {
      core:   String(core?.ver || TOPW.H2O_MM_CORE_VER || '').trim()   || null,
      engine: String(rt?.ver   || TOPW.H2O_MM_ENGINE_VER || '').trim() || null,
      shell:  String(TOPW.H2O_MM_SHELL_VER || '').trim()               || null,
    };
  }

  /* ─── Command Bar geometry proxy ─────────────────────────────────────────── */
  function measureCommandBarGeometry(force = false) {
    const root = commandBarRoot();
    const now = safeNow();
    const seq = Number(S.seq || 0);
    const staleByTime = (now - Number(S.commandBarGeom.lastAt || 0)) >= CMD_GEOM_REFRESH_MS;
    const staleBySeq = (seq - Number(S.commandBarGeom.lastSeq || 0)) >= CMD_GEOM_REFRESH_EVERY_SNAPSHOTS;
    if (!force && !staleByTime && !staleBySeq) return Object.assign({}, S.commandBarGeom);

    if (!root || !root.isConnected) {
      Object.assign(S.commandBarGeom, {
        lastMs: null,
        lastAt: now,
        lastSeq: seq,
        width: null,
        height: null,
        collapsed: null,
        present: false,
      });
      return Object.assign({}, S.commandBarGeom);
    }

    const t0 = PERF_TIME();
    let rect = null;
    try { rect = root.getBoundingClientRect(); } catch {}
    const elapsed = roundMs(PERF_TIME() - t0);
    Object.assign(S.commandBarGeom, {
      lastMs: elapsed,
      lastAt: now,
      lastSeq: seq,
      width: rect ? Math.round(Number(rect.width || 0)) : null,
      height: rect ? Math.round(Number(rect.height || 0)) : null,
      collapsed: !!root.classList?.contains?.('collapsed'),
      present: true,
    });
    return Object.assign({}, S.commandBarGeom);
  }

  /* ─── Unmount hidden group count ─────────────────────────────────────────── */
  function countUnmountedGroups(state) {
    const map = state?.unmountMap;
    if (!(map instanceof Map)) return 0;
    const seen = new Set();
    let count  = 0;
    for (const rec of map.values()) {
      const key = String(rec?.key || rec?.primaryUid || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      count += 1;
    }
    return count;
  }

  /* ─── Observer Hub mutation volume ───────────────────────────────────────── */
  function recordObserverVolume(detail) {
    const d = (detail && typeof detail === 'object') ? detail : {};
    const ts = Number(d.ts || safeNow());
    S.obsVolume.totalFlushes += 1;
    S.obsVolume.totalRawBatches += Number(d.rawBatchCount || 0);
    S.obsVolume.totalAdded += Number(d.addedCount || 0);
    S.obsVolume.totalRemoved += Number(d.removedCount || 0);
    if (d.conversationRelevant) S.obsVolume.totalConversationRelevant += 1;
    S.obsVolume.entries.push({
      ts,
      rawBatchCount: Number(d.rawBatchCount || 0),
      addedCount: Number(d.addedCount || 0),
      removedCount: Number(d.removedCount || 0),
      conversationRelevant: !!d.conversationRelevant,
    });
    trimWindow(S.obsVolume.entries, OBS_VOLUME_WINDOW_MS, safeNow());
  }

  function observerVolumeSnapshot() {
    trimWindow(S.obsVolume.entries, OBS_VOLUME_WINDOW_MS, safeNow());
    let rawBatchCount = 0;
    let addedCount = 0;
    let removedCount = 0;
    let conversationRelevantCount = 0;
    for (const item of S.obsVolume.entries) {
      rawBatchCount += Number(item.rawBatchCount || 0);
      addedCount += Number(item.addedCount || 0);
      removedCount += Number(item.removedCount || 0);
      if (item.conversationRelevant) conversationRelevantCount += 1;
    }
    return {
      windowMs: OBS_VOLUME_WINDOW_MS,
      flushCount: S.obsVolume.entries.length,
      rawBatchCount,
      addedCount,
      removedCount,
      conversationRelevantCount,
      totals: {
        flushes: Number(S.obsVolume.totalFlushes || 0),
        rawBatches: Number(S.obsVolume.totalRawBatches || 0),
        added: Number(S.obsVolume.totalAdded || 0),
        removed: Number(S.obsVolume.totalRemoved || 0),
        conversationRelevant: Number(S.obsVolume.totalConversationRelevant || 0),
      },
    };
  }

  /* ─── Long task monitor ──────────────────────────────────────────────────── */
  function trimLongTasks() {
    trimWindow(S.longTask.entries, LONG_TASK_WINDOW_MS, safeNow());
    return S.longTask.entries;
  }

  function installLongTaskObserver() {
    if (S.longTask.observer || !('PerformanceObserver' in W)) return;
    try {
      const po = new W.PerformanceObserver((list) => {
        const now = safeNow();
        for (const entry of list.getEntries()) {
          const dur = roundMs(entry?.duration);
          S.longTask.totalCount += 1;
          S.longTask.lastMs = dur;
          if (!Number.isFinite(Number(S.longTask.peakMs)) || Number(dur || 0) > Number(S.longTask.peakMs || 0)) {
            S.longTask.peakMs = dur;
          }
          S.longTask.entries.push({ ts: now, dur });
        }
        trimLongTasks();
      });
      po.observe({ type: 'longtask', buffered: true });
      S.longTask.observer = po;
      S.longTask.supported = true;
    } catch {
      S.longTask.supported = false;
    }
  }

  function getLongTaskSnapshot() {
    trimLongTasks();
    let count = S.longTask.entries.length;
    let maxRecentMs = null;
    for (const item of S.longTask.entries) {
      const dur = Number(item?.dur);
      if (!Number.isFinite(dur)) continue;
      if (!Number.isFinite(Number(maxRecentMs)) || dur > Number(maxRecentMs)) maxRecentMs = dur;
    }
    return {
      supported: !!S.longTask.supported,
      windowMs: LONG_TASK_WINDOW_MS,
      count,
      lastMs: roundMs(S.longTask.lastMs),
      peakMs: roundMs(S.longTask.peakMs),
      maxRecentMs: roundMs(maxRecentMs),
      totalCount: Number(S.longTask.totalCount || 0),
    };
  }

  /* ─── Event loop lag monitor ─────────────────────────────────────────────── */
  function installEventLoopLagMonitor() {
    if (S.eventLoop.intervalId) return;
    S.eventLoop.expectedAt = PERF_TIME() + EVENT_LOOP_INTERVAL_MS;
    S.eventLoop.intervalId = W.setInterval(() => {
      const nowPerf = PERF_TIME();
      if (D.hidden) {
        S.eventLoop.expectedAt = nowPerf + EVENT_LOOP_INTERVAL_MS;
        return;
      }
      const lag = Math.max(0, nowPerf - Number(S.eventLoop.expectedAt || nowPerf));
      S.eventLoop.expectedAt = nowPerf + EVENT_LOOP_INTERVAL_MS;
      S.eventLoop.lastLagMs = roundMs(lag);
      if (!Number.isFinite(Number(S.eventLoop.peakLagMs)) || lag > Number(S.eventLoop.peakLagMs || 0)) {
        S.eventLoop.peakLagMs = roundMs(lag);
      }
      S.eventLoop.sampleWindow.push(roundMs(lag));
      if (S.eventLoop.sampleWindow.length > EVENT_LOOP_WINDOW_SAMPLES) S.eventLoop.sampleWindow.shift();
      let sum = 0;
      let count = 0;
      for (const sample of S.eventLoop.sampleWindow) {
        const n = Number(sample);
        if (!Number.isFinite(n)) continue;
        sum += n;
        count += 1;
      }
      S.eventLoop.samples = count;
      S.eventLoop.avgLagMs = count ? roundMs(sum / count) : null;
    }, EVENT_LOOP_INTERVAL_MS);
  }

  function getEventLoopLagSnapshot() {
    return {
      intervalMs: EVENT_LOOP_INTERVAL_MS,
      lastLagMs: roundMs(S.eventLoop.lastLagMs),
      avgLagMs: roundMs(S.eventLoop.avgLagMs),
      peakLagMs: roundMs(S.eventLoop.peakLagMs),
      samples: Number(S.eventLoop.samples || 0),
    };
  }

  /* ─── Non-destructive function wrapper ───────────────────────────────────── */
  function installWrapOnce(target, key, tag, onCall) {
    if (!target || typeof target !== 'object') return false;
    const orig = target[key];
    if (typeof orig !== 'function') return false;
    if (orig.__h2oPerfWrapped === tag) return true;
    if (orig.__h2oPerfWrapped) return false;

    const wrapped = function (...args) {
      const t0 = PERF_TIME();
      let result;
      let error;
      try {
        result = orig.apply(this, args);
      } catch (err) {
        error = err;
      } finally {
        try {
          onCall(this, args, {
            result,
            error,
            elapsedMs: roundMs(PERF_TIME() - t0),
          });
        } catch {}
      }
      if (error) throw error;
      return result;
    };

    wrapped.__h2oPerfWrapped = tag;
    wrapped.__h2oPerfOriginal = orig;

    try {
      target[key] = wrapped;
      return true;
    } catch {
      return false;
    }
  }

  /* ─── MiniMap instrumentation ────────────────────────────────────────────── */
  function installMiniMapWrappers() {
    const core = mmCoreApi();
    const rt   = mmRtApi();

    if (core && !S.coreWrapped) {
      const a = installWrapOnce(core, 'scheduleRebuild', 'perf:core:sched',
        (_ctx, args) => {
          S.mm.coreScheduleRequests += 1;
          S.mm.lastCoreReason = String(args?.[0] || '').trim();
        });

      const b = installWrapOnce(core, 'rebuildNow', 'perf:core:rebuild',
        (_ctx, args, meta) => {
          S.mm.coreRebuildNowCalls += 1;
          S.mm.lastCoreReason = String(args?.[0] || '').trim();
          S.mm.lastCoreRebuildAt = safeNow();
          S.mm.lastCoreRebuildStatus = String(meta?.result?.status || (meta?.result?.ok ? 'ok' : meta?.error ? 'error' : 'unknown'));
          S.mm.coreRebuildLastMs = roundMs(meta?.elapsedMs);
          const next = avgPush(S.mm.coreRebuildAvgMs, S.mm.coreRebuildSamples, meta?.elapsedMs);
          S.mm.coreRebuildAvgMs = next.avg;
          S.mm.coreRebuildSamples = next.count;
        });

      S.coreWrapped = !!(a || b);
    }

    if (rt && !S.rtWrapped) {
      const a = installWrapOnce(rt, 'scheduleRebuild', 'perf:rt:sched',
        (_ctx, args) => {
          S.mm.engineScheduleRequests += 1;
          S.mm.lastEngineReason = String(args?.[0] || '').trim();
        });

      const b = installWrapOnce(rt, 'rebuildNow', 'perf:rt:rebuild',
        (_ctx, args, meta) => {
          S.mm.engineRebuildNowCalls += 1;
          S.mm.lastEngineReason = String(args?.[0] || '').trim();
          S.mm.lastEngineRebuildAt = safeNow();
          S.mm.lastEngineRebuildStatus = meta?.result === true ? 'ok'
            : meta?.result === false ? 'failed'
            : meta?.error ? 'error'
            : 'unknown';
          S.mm.engineRebuildLastMs = roundMs(meta?.elapsedMs);
          const next = avgPush(S.mm.engineRebuildAvgMs, S.mm.engineRebuildSamples, meta?.elapsedMs);
          S.mm.engineRebuildAvgMs = next.avg;
          S.mm.engineRebuildSamples = next.count;
        });

      S.rtWrapped = !!(a || b);
    }

    return !!(S.coreWrapped || S.rtWrapped);
  }

  /* ─── Pagination instrumentation (public API only) ──────────────────────── */
  function notePaginationTiming(op, meta) {
    S.pagination.lastRenderMs = roundMs(meta?.elapsedMs);
    S.pagination.lastOp = String(op || '');
    S.pagination.lastAt = safeNow();
    const next = avgPush(S.pagination.avgRenderMs, S.pagination.samples, meta?.elapsedMs);
    S.pagination.avgRenderMs = next.avg;
    S.pagination.samples = next.count;
  }

  function installPaginationWrappers() {
    const api = paginationApi();
    if (!api) return false;
    const methods = [
      'goToPage',
      'goToPageStart',
      'goOlder',
      'goNewer',
      'goToAnswerGid',
      'goFirst',
      'goLast',
      'rebuildIndex',
      'setEnabled',
    ];
    let wrappedAny = false;
    for (const key of methods) {
      wrappedAny = installWrapOnce(api, key, `perf:pw:${key}`,
        (_ctx, args, meta) => {
          const op = `${key}${args?.[1] ? `:${String(args[1])}` : ''}`;
          notePaginationTiming(op, meta);
        }) || wrappedAny;
    }
    if (wrappedAny) S.pgWrapped = true;
    return wrappedAny;
  }

  /* ─── Unmount instrumentation (public API only) ─────────────────────────── */
  function installUnmountWrappers() {
    const api = unmountApi();
    if (!api) return false;
    const state = unmountVaultState();
    let wrappedAny = false;

    const runPassOrig = api.runPass;
    if (typeof runPassOrig === 'function' && runPassOrig.__h2oPerfWrapped !== 'perf:um:runPass' && !runPassOrig.__h2oPerfWrapped) {
      const wrappedRunPass = function (...args) {
        const before = countUnmountedGroups(unmountVaultState());
        const t0 = PERF_TIME();
        let result;
        let error;
        try {
          result = runPassOrig.apply(this, args);
        } catch (err) {
          error = err;
        } finally {
          const after = countUnmountedGroups(unmountVaultState());
          const elapsedMs = roundMs(PERF_TIME() - t0);
          S.unmountPerf.lastPassMs = elapsedMs;
          S.unmountPerf.lastPassReason = String(args?.[0] || '').trim();
          S.unmountPerf.lastPassAt = safeNow();
          S.unmountPerf.lastHiddenBefore = before;
          S.unmountPerf.lastHiddenAfter = after;
          S.unmountPerf.lastHiddenDelta = Number(after) - Number(before);
          const next = avgPush(S.unmountPerf.avgPassMs, S.unmountPerf.passSamples, elapsedMs);
          S.unmountPerf.avgPassMs = next.avg;
          S.unmountPerf.passSamples = next.count;
        }
        if (error) throw error;
        return result;
      };
      wrappedRunPass.__h2oPerfWrapped = 'perf:um:runPass';
      wrappedRunPass.__h2oPerfOriginal = runPassOrig;
      try { api.runPass = wrappedRunPass; wrappedAny = true; } catch {}
    } else if (runPassOrig && runPassOrig.__h2oPerfWrapped === 'perf:um:runPass') {
      wrappedAny = true;
    }

    wrappedAny = installWrapOnce(api, 'remountAll', 'perf:um:remountAll',
      (_ctx, _args, meta) => {
        S.unmountPerf.lastRestoreMs = roundMs(meta?.elapsedMs);
        S.unmountPerf.lastRestoreAt = safeNow();
        S.unmountPerf.lastRestoreCount = Number(meta?.result || 0);
        const next = avgPush(S.unmountPerf.avgRestoreMs, S.unmountPerf.restoreSamples, meta?.elapsedMs);
        S.unmountPerf.avgRestoreMs = next.avg;
        S.unmountPerf.restoreSamples = next.count;
      }) || wrappedAny;

    if (wrappedAny) S.umWrapped = true;
    return wrappedAny;
  }

  /* ─── Retry installers ───────────────────────────────────────────────────── */
  function clearInstallTimer() {
    if (!S.installTimer) return;
    try { clearTimeout(S.installTimer); } catch {}
    S.installTimer = 0;
  }

  function scheduleInstallRetry() {
    clearInstallTimer();
    if (S.installTries >= 60) return;
    S.installTimer = W.setTimeout(() => {
      S.installTimer = 0;
      S.installTries += 1;
      install();
      if (!(S.coreWrapped && S.rtWrapped && S.pgWrapped && S.umWrapped)) scheduleInstallRetry();
    }, 500);
  }

  function installListenersOnce() {
    if (S.listenersInstalled) return;
    S.listenersInstalled = true;
    installLongTaskObserver();
    installEventLoopLagMonitor();

    const onObsFlush = (event) => {
      try { recordObserverVolume(event?.detail || null); } catch {}
    };
    try { W.addEventListener('evt:h2o:obs:flush', onObsFlush, { passive: true }); } catch {}

    const readyEvents = [
      'evt:h2o:minimap:engine-ready',
      'evt:h2o:minimap:shell-ready',
      'evt:h2o:obs:ready',
      'evt:h2o:core:ready',
      'evt:h2o:pagination:pagechanged',
    ];
    for (const ev of readyEvents) {
      try {
        W.addEventListener(ev, () => {
          markKnownSubsystems();
          install();
        }, { passive: true });
      } catch {}
    }
  }

  function install() {
    installListenersOnce();
    markKnownSubsystems();
    installMiniMapWrappers();
    installPaginationWrappers();
    installUnmountWrappers();
    if (!(S.coreWrapped && S.rtWrapped && S.pgWrapped && S.umWrapped)) scheduleInstallRetry();
  }

  /* ─── Sub-snapshots ──────────────────────────────────────────────────────── */
  function getPaginationSnapshot() {
    const api = paginationApi();
    if (!api) return null;
    let page = null, config = null, summary = null;
    try { page    = typeof api.getPageInfo === 'function' ? api.getPageInfo() : null; } catch {}
    try { config  = typeof api.getConfig   === 'function' ? api.getConfig()   : null; } catch {}
    try { summary = typeof api.getSummary  === 'function' ? api.getSummary()  : null; } catch {}
    return {
      page,
      config,
      summary,
      timing: {
        lastRenderMs: roundMs(S.pagination.lastRenderMs),
        avgRenderMs: roundMs(S.pagination.avgRenderMs),
        samples: Number(S.pagination.samples || 0),
        lastOp: String(S.pagination.lastOp || ''),
        lastAt: Number(S.pagination.lastAt || 0),
      },
    };
  }

  function getMiniMapSnapshot() {
    const core = mmCoreApi();
    const rt   = mmRtApi();

    const answerEls = (() => {
      try {
        const list = core?.getAnswerList?.();
        return Array.isArray(list) ? list : [];
      } catch { return []; }
    })();

    const turns = (() => {
      try {
        const list = core?.getTurns?.();
        return Array.isArray(list) ? list : [];
      } catch { return []; }
    })();

    return {
      versions: getMiniMapVersions(),
      ready: {
        core:   !!core,
        engine: !!rt,
        shell:  !!TOPW.H2O_MM_SHELL_READY,
      },
      turnCount: turns.length || null,
      visibleAnswers: answerEls.filter(el => !!el && el.isConnected).length,
      rebuilds: {
        coreScheduleRequests: Number(S.mm.coreScheduleRequests || 0),
        coreRebuildNowCalls: Number(S.mm.coreRebuildNowCalls || 0),
        engineScheduleRequests: Number(S.mm.engineScheduleRequests || 0),
        engineRebuildNowCalls: Number(S.mm.engineRebuildNowCalls || 0),
        lastCoreReason: String(S.mm.lastCoreReason || ''),
        lastEngineReason: String(S.mm.lastEngineReason || ''),
        lastCoreStatus: String(S.mm.lastCoreRebuildStatus || ''),
        lastEngineStatus: String(S.mm.lastEngineRebuildStatus || ''),
        lastCoreAt: Number(S.mm.lastCoreRebuildAt || 0),
        lastEngineAt: Number(S.mm.lastEngineRebuildAt || 0),
        lastCoreMs: roundMs(S.mm.coreRebuildLastMs),
        avgCoreMs: roundMs(S.mm.coreRebuildAvgMs),
        coreSamples: Number(S.mm.coreRebuildSamples || 0),
        lastEngineMs: roundMs(S.mm.engineRebuildLastMs),
        avgEngineMs: roundMs(S.mm.engineRebuildAvgMs),
        engineSamples: Number(S.mm.engineRebuildSamples || 0),
      },
    };
  }

  function getUnmountSnapshot() {
    const api = unmountApi();
    const state = unmountVaultState();
    const config = (() => {
      try { return typeof api?.getConfig === 'function' ? api.getConfig() : null; } catch { return null; }
    })();
    const hiddenGroups = countUnmountedGroups(state);
    const enabled = config ? config.enabled !== false : null;
    return {
      enabled,
      hiddenGroups,
      intervalMs: config?.intervalMs || null,
      minMsgs: config?.minMsgsForUnmount || null,
      marginPx: config?.unmountMarginPx || null,
      rootMoActive: !!state?.rootMO,
      hubMutBound: typeof state?.hubMutOff === 'function',
      summary: enabled == null ? null
        : enabled ? `ON • ${hiddenGroups} hidden`
        : 'OFF',
      timing: {
        lastPassMs: roundMs(S.unmountPerf.lastPassMs),
        avgPassMs: roundMs(S.unmountPerf.avgPassMs),
        passSamples: Number(S.unmountPerf.passSamples || 0),
        lastPassReason: String(S.unmountPerf.lastPassReason || ''),
        lastPassAt: Number(S.unmountPerf.lastPassAt || 0),
        lastHiddenBefore: S.unmountPerf.lastHiddenBefore,
        lastHiddenAfter: S.unmountPerf.lastHiddenAfter,
        lastHiddenDelta: S.unmountPerf.lastHiddenDelta,
        lastRestoreMs: roundMs(S.unmountPerf.lastRestoreMs),
        avgRestoreMs: roundMs(S.unmountPerf.avgRestoreMs),
        restoreSamples: Number(S.unmountPerf.restoreSamples || 0),
        lastRestoreAt: Number(S.unmountPerf.lastRestoreAt || 0),
        lastRestoreCount: S.unmountPerf.lastRestoreCount,
      },
    };
  }

  function getObserverHubSnapshot() {
    const hub = observerHubApi();
    let stats = null;
    try { stats = typeof hub?.stats === 'function' ? hub.stats() : null; } catch {}
    return {
      ready: !!hub,
      stats,
      volume: observerVolumeSnapshot(),
    };
  }

  function getGovernorSnapshot() {
    const api = governorApi();
    let state = null, resolved = null;
    try { state    = typeof api?.getState           === 'function' ? api.getState()           : null; } catch {}
    try { resolved = typeof api?.getResolvedProfile === 'function' ? api.getResolvedProfile() : null; } catch {}
    return { state, resolved };
  }

  /* ─── Master snapshot ────────────────────────────────────────────────────── */
  function snapshot() {
    install();
    if (!S.firstSnapshotAt) S.firstSnapshotAt = safeNow();
    S.seq += 1;

    const t0 = PERF_TIME();
    markKnownSubsystems();

    const pagSnap  = getPaginationSnapshot();
    const mmSnap   = getMiniMapSnapshot();
    const umSnap   = getUnmountSnapshot();
    const hubSnap  = getObserverHubSnapshot();
    const gvSnap   = getGovernorSnapshot();

    const perfMem = (() => { try { return TOPW.performance?.memory || null; } catch { return null; } })();
    const convRoot = getConversationRoot();
    const bodyRoot = D.body || D.documentElement || null;

    const convNodes = countNodes(convRoot);
    const bodyNodes = getCachedBodyNodeCount(bodyRoot);
    const heapUsedMB = toMB(perfMem?.usedJSHeapSize);
    const cmdGeom = measureCommandBarGeometry();
    const longTasks = getLongTaskSnapshot();
    const eventLoopLag = getEventLoopLagSnapshot();

    updatePeak('heapUsedMB', heapUsedMB);
    updatePeak('conversationDomNodes', convNodes);
    updatePeak('domNodes', bodyNodes);

    const snapshotMs = roundMs(PERF_TIME() - t0);
    S.snapshotStats.lastMs = snapshotMs;
    const snapNext = avgPush(S.snapshotStats.avgMs, S.snapshotStats.samples, snapshotMs);
    S.snapshotStats.avgMs = snapNext.avg;
    S.snapshotStats.samples = snapNext.count;
    if (!Number.isFinite(Number(S.snapshotStats.peakMs)) || Number(snapshotMs || 0) > Number(S.snapshotStats.peakMs || 0)) {
      S.snapshotStats.peakMs = snapshotMs;
    }

    return {
      seq: Number(S.seq),
      ts: safeNow(),
      uptimeMs: Math.max(0, safeNow() - Number(S.startedAt || safeNow())),
      snapshotMs,
      snapshotAvgMs: roundMs(S.snapshotStats.avgMs),
      snapshotPeakMs: roundMs(S.snapshotStats.peakMs),

      heapUsedMB,
      heapTotalMB: toMB(perfMem?.totalJSHeapSize),
      heapLimitMB: toMB(perfMem?.jsHeapSizeLimit),
      peakHeapMB: roundMs(S.peaks.heapUsedMB),

      domNodes: bodyNodes,
      conversationDomNodes: convNodes,
      peakConversationDomNodes: Number.isFinite(Number(S.peaks.conversationDomNodes)) ? Number(S.peaks.conversationDomNodes) : null,
      peakDomNodes: Number.isFinite(Number(S.peaks.domNodes)) ? Number(S.peaks.domNodes) : null,

      commandBarGeometryMs: roundMs(cmdGeom?.lastMs),
      commandBarGeometry: cmdGeom,
      longTasks,
      eventLoopLag,
      bootPhases: {
        perfBootMs: 0,
        firstSnapshotMs: relativeMs(S.firstSnapshotAt),
        firstMiniMapReadyMs: relativeMs(S.lastSeen.minimapReadyAt),
        firstPaginationReadyMs: relativeMs(S.lastSeen.paginationReadyAt),
        firstUnmountReadyMs: relativeMs(S.lastSeen.unmountReadyAt),
        firstObserverHubReadyMs: relativeMs(S.lastSeen.observerHubReadyAt),
        firstCommandBarReadyMs: relativeMs(S.lastSeen.commandBarReadyAt),
      },

      page: pagSnap?.page || null,
      pageConfig: pagSnap?.config || null,
      pageSummary: pagSnap?.summary || null,
      pagination: pagSnap,

      turns: {
        total: Number(pagSnap?.page?.totalTurns || mmSnap.turnCount || 0) || null,
        visibleAnswers: Number(mmSnap.visibleAnswers || 0),
      },

      minimap: mmSnap,
      minimapRebuildMs: {
        coreLastMs: roundMs(mmSnap?.rebuilds?.lastCoreMs),
        coreAvgMs: roundMs(mmSnap?.rebuilds?.avgCoreMs),
        engineLastMs: roundMs(mmSnap?.rebuilds?.lastEngineMs),
        engineAvgMs: roundMs(mmSnap?.rebuilds?.avgEngineMs),
      },
      paginationRenderMs: {
        lastMs: roundMs(pagSnap?.timing?.lastRenderMs),
        avgMs: roundMs(pagSnap?.timing?.avgRenderMs),
        lastOp: String(pagSnap?.timing?.lastOp || ''),
      },
      unmountPassMs: {
        lastMs: roundMs(umSnap?.timing?.lastPassMs),
        avgMs: roundMs(umSnap?.timing?.avgPassMs),
        lastReason: String(umSnap?.timing?.lastPassReason || ''),
        hiddenBefore: umSnap?.timing?.lastHiddenBefore ?? null,
        hiddenAfter: umSnap?.timing?.lastHiddenAfter ?? null,
      },
      unmount: umSnap,
      observerHub: hubSnap,
      governor: gvSnap,
    };
  }

  /* ─── Counter reset ──────────────────────────────────────────────────────── */
  function resetCounters() {
    S.seq = 0;
    S.startedAt = safeNow();
    S.firstSnapshotAt = 0;
    S.bodyDomNodes = null;
    S.bodyDomCountAt = 0;
    S.bodyDomCountSeq = 0;
    S.snapshotStats = { lastMs: null, avgMs: null, peakMs: null, samples: 0 };
    S.peaks = { heapUsedMB: null, conversationDomNodes: null, domNodes: null };
    S.commandBarGeom = {
      lastMs: null,
      lastAt: 0,
      lastSeq: 0,
      width: null,
      height: null,
      collapsed: null,
      present: false,
    };
    S.longTask.entries = [];
    S.longTask.totalCount = 0;
    S.longTask.lastMs = null;
    S.longTask.peakMs = null;
    S.eventLoop.lastLagMs = null;
    S.eventLoop.avgLagMs = null;
    S.eventLoop.peakLagMs = null;
    S.eventLoop.samples = 0;
    S.eventLoop.sampleWindow = [];
    S.obsVolume.entries = [];
    S.obsVolume.totalFlushes = 0;
    S.obsVolume.totalRawBatches = 0;
    S.obsVolume.totalAdded = 0;
    S.obsVolume.totalRemoved = 0;
    S.obsVolume.totalConversationRelevant = 0;
    S.pagination = { lastRenderMs: null, avgRenderMs: null, samples: 0, lastOp: '', lastAt: 0 };
    S.unmountPerf = {
      lastPassMs: null,
      avgPassMs: null,
      passSamples: 0,
      lastPassReason: '',
      lastPassAt: 0,
      lastHiddenBefore: null,
      lastHiddenAfter: null,
      lastHiddenDelta: null,
      lastRestoreMs: null,
      avgRestoreMs: null,
      restoreSamples: 0,
      lastRestoreAt: 0,
      lastRestoreCount: null,
    };
    Object.assign(S.mm, {
      coreScheduleRequests:   0,
      coreRebuildNowCalls:    0,
      engineScheduleRequests: 0,
      engineRebuildNowCalls:  0,
      lastCoreReason:         '',
      lastEngineReason:       '',
      lastCoreRebuildAt:      0,
      lastEngineRebuildAt:    0,
      lastCoreRebuildStatus:  '',
      lastEngineRebuildStatus:'',
      coreRebuildLastMs:      null,
      coreRebuildAvgMs:       null,
      coreRebuildSamples:     0,
      engineRebuildLastMs:    null,
      engineRebuildAvgMs:     null,
      engineRebuildSamples:   0,
    });
    return snapshot();
  }

  /* ─── Public API ─────────────────────────────────────────────────────────── */
  const API = {
    ver: '1.2.0',
    install,
    snapshot,
    resetCounters,
    getState: () => ({
      booted: !!S.booted,
      startedAt: Number(S.startedAt || 0),
      coreWrapped: !!S.coreWrapped,
      rtWrapped: !!S.rtWrapped,
      pgWrapped: !!S.pgWrapped,
      umWrapped: !!S.umWrapped,
      seq: Number(S.seq || 0),
      snapshot: Object.assign({}, S.snapshotStats),
      peaks: Object.assign({}, S.peaks),
      mm: Object.assign({}, S.mm),
      pagination: Object.assign({}, S.pagination),
      unmountPerf: Object.assign({}, S.unmountPerf),
      commandBarGeometry: Object.assign({}, S.commandBarGeom),
      longTask: {
        supported: !!S.longTask.supported,
        totalCount: Number(S.longTask.totalCount || 0),
        lastMs: roundMs(S.longTask.lastMs),
        peakMs: roundMs(S.longTask.peakMs),
      },
      eventLoop: {
        lastLagMs: roundMs(S.eventLoop.lastLagMs),
        avgLagMs: roundMs(S.eventLoop.avgLagMs),
        peakLagMs: roundMs(S.eventLoop.peakLagMs),
        samples: Number(S.eventLoop.samples || 0),
      },
      observerVolume: observerVolumeSnapshot(),
    }),
  };

  VAULT.api = API;
  H2O.perf = H2O.perf || {};
  H2O.perf.api = API;
  H2O.perf.snapshot = snapshot;
  H2O.perf.install = install;
  H2O.perf.resetCounters = resetCounters;
  H2O.perf.getState = API.getState;

  S.booted = true;
  try { TOPW.H2O_PERF_SNAPSHOT_READY = true; } catch {}

  install();
})();
