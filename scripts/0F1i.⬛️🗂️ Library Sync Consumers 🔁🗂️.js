// ==H2O Module==
// @h2o-id             0f1i.library_sync_consumers
// @name               0F1i.⬛️🗂️ Library Sync Consumers 🔁🗂️
// @namespace          H2O.Premium.CGX.library_sync_consumers
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000100
// @description        Native Library Sync Consumers: subscribes to evt:h2o:library:cross-surface-sync (dispatched by 0F1h when Studio writes a cross-surface broadcast) and re-runs existing public refresh methods so the chatgpt.com tab reflects Studio-side mutations. Strictly additive — adds NO new state, mutates NO existing module, and only calls methods that already exist on H2O.LibraryWorkspace / H2O.LibraryIndex / H2O.folders / H2O.Labels / H2O.Projects. Each call is wrapped defensively so an absent method is a silent no-op. Coalesces inbound bursts via a 220ms debounce on top of 0F1h's own 350ms.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ 0F1i Library Sync Consumers (native)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 50, errMax: 20 };
  const step = (s, o = '') => {
    try {
      diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) });
      if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
    } catch {}
  };
  const err = (s, e) => {
    try {
      diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) });
      if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
    } catch {}
  };

  // 0F1h's outbound path (native → Studio) writes chrome.storage and does NOT
  // re-emit evt:h2o:library:cross-surface-sync locally — only inbound (Studio →
  // native, reason='studio-broadcast') fires this event on the native window.
  // That means every event we receive is a Studio-originated change, so no
  // loop-suppression filtering is needed beyond the dual-event dedupe below.
  const COALESCE_MS = 220;
  const DUAL_EVENT_WINDOW_MS = 50;

  // Reason hints carried in the Studio broadcast payload. We don't fail if a
  // hint is missing — the catch-all (refresh everything) runs whenever the
  // routed set is empty. These strings come from Studio S0F1h's broadcast.
  const FOLDER_REASONS = new Set([
    'folder-binding-changed', 'setFolderBinding', 'folders-changed',
  ]);
  const CATEGORY_REASONS = new Set([
    'category-changed', 'setSnapshotCategory', 'categories-changed',
  ]);

  const state = {
    bound: false,
    pendingTimer: null,
    pendingReasons: new Set(),
    lastDetailTs: 0,
    lastEventName: '',
    runs: 0,
    lastRunAt: 0,
  };

  function dualDedupe(eventName, detail) {
    const ts = Number(detail?.t || Date.now());
    if (state.lastDetailTs === ts && state.lastEventName !== eventName) {
      return true;
    }
    state.lastDetailTs = ts;
    state.lastEventName = eventName;
    return false;
  }

  function reasonOf(detail) {
    const r = String(detail?.reason || '');
    const sub = String(detail?.payload?.reason || '');
    return sub || r;
  }

  function classifyReason(reason) {
    const r = String(reason || '');
    return {
      folder: FOLDER_REASONS.has(r),
      category: CATEGORY_REASONS.has(r),
      unknown: !FOLDER_REASONS.has(r) && !CATEGORY_REASONS.has(r),
    };
  }

  function safeCall(label, fn) {
    if (typeof fn !== 'function') return false;
    try {
      const out = fn();
      if (out && typeof out.then === 'function') {
        out.catch((e) => err(`${label}.async`, e));
      }
      step(label);
      return true;
    } catch (e) { err(label, e); return false; }
  }

  // The actual refresh fan-out. Every method is checked for existence at call
  // time — order matters only insofar as model layers (Workspace, Index) want
  // to settle before render-layer reads (sidebar sync, projects reconcile).
  function runRefresh(reasons) {
    state.runs += 1;
    state.lastRunAt = Date.now();
    const reason = `cross-surface-sync(${Array.from(reasons).join(',') || 'change'})`;

    const cls = Array.from(reasons).reduce((acc, r) => {
      const c = classifyReason(r);
      acc.folder = acc.folder || c.folder;
      acc.category = acc.category || c.category;
      acc.unknown = acc.unknown || c.unknown;
      return acc;
    }, { folder: false, category: false, unknown: false });
    const full = cls.unknown || (!cls.folder && !cls.category);

    const ws = H2O.LibraryWorkspace;
    const idx = H2O.LibraryIndex;
    const ins = H2O.LibraryInsights;
    const fld = H2O.folders;
    const lbl = H2O.Labels;
    const prj = H2O.Projects;

    // Canonical model first.
    safeCall('workspace.refresh', () => ws?.refresh?.(reason));
    // Index recompute (force a real refresh, not just a scheduled one).
    safeCall('index.refresh', () => idx?.refresh?.(reason, { refresh: true }));
    // Insights (no-op if its page isn't open; method exists regardless).
    safeCall('insights.refresh', () => ins?.refresh?.(reason));

    if (cls.folder || full) {
      // ensureInjected re-renders the folder sidebar section from current
      // truth — no separate "sync active state" method is exposed publicly.
      safeCall('folders.ensureInjected', () => fld?.ensureInjected?.(reason));
    }
    if (cls.category || full) {
      // No public refresh on H2O.Categories beyond appearance + candidate-pool,
      // both of which are semantic operations we should not invoke routinely.
      // Workspace + Index above already recompute the category catalog & counts.
    }
    if (full) {
      safeCall('labels.ensureInjected', () => lbl?.ensureInjected?.(reason));
      // H2O.Projects exposes `refresh(reason?)` as the public entry point
      // (internally aliases refreshFullStore on the owner).
      safeCall('projects.refresh', () => prj?.refresh?.(reason));
    }
  }

  function scheduleRefresh(reasons) {
    for (const r of reasons) state.pendingReasons.add(r);
    if (state.pendingTimer) return;
    state.pendingTimer = W.setTimeout(() => {
      const drained = state.pendingReasons;
      state.pendingReasons = new Set();
      state.pendingTimer = null;
      runRefresh(drained);
    }, COALESCE_MS);
  }

  function onSync(eventName, ev) {
    const detail = ev?.detail || {};
    if (dualDedupe(eventName, detail)) return;
    const reason = reasonOf(detail);
    scheduleRefresh([reason || 'change']);
    step('recv', eventName);
  }

  function bind() {
    if (state.bound) return true;
    try {
      // Listen to both canonical + legacy aliases (0F1h fires both).
      W.addEventListener('evt:h2o:library:cross-surface-sync', (ev) => onSync('evt:h2o:library:cross-surface-sync', ev));
      W.addEventListener('h2o:library:cross-surface-sync', (ev) => onSync('h2o:library:cross-surface-sync', ev));
      state.bound = true;
      step('bind');
      return true;
    } catch (e) { err('bind', e); return false; }
  }

  const Consumers = {
    surface: 'native',
    diagnose() {
      return {
        version: '1.0.0',
        bound: state.bound,
        coalesceMs: COALESCE_MS,
        pendingReasons: Array.from(state.pendingReasons),
        runs: state.runs,
        lastRunAt: state.lastRunAt,
        lastDetailTs: state.lastDetailTs,
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
    // Manual probe — useful from devtools to verify the fan-out plumbing.
    pingNow(reason) { scheduleRefresh([String(reason || 'manual.ping')]); },
  };

  H2O.Library.SyncConsumers = Consumers;

  function registerOnCore() {
    const core = H2O.LibraryCore;
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('library-sync-consumers', Consumers, { replace: true });
      core.registerService('library-sync-consumers', Consumers, { replace: true });
      step('register-on-core');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }

  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });
  }
  bind();

  step('boot', 'native-library-sync-consumers-ready');
})();
